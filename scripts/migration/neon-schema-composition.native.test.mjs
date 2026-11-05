import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const PROFILE="/Users/timax/Projects/clawdeals-migration-backups/network-fixture/pg-unix-only.sb";
const PROFILE_SHA="f4350ece95071edeef719e34591555fc347586de9e0290b1e5780eb527900cf7";
const ROOT="/private/tmp/cd-pg-proof-xp3zflsn";
const PG="/Users/timax/clawdeals-rehearsal-aRRRAgId/pg17/bin";
const SOURCE="/Users/timax/clawdeals-rehearsal-aRRRAgId/schema-review/schema-review.sql";
const CANONICAL="/Users/timax/clawdeals-rehearsal-aRRRAgId/canonical-routines-v2/canonical-routines-v2.json";
const CATALOG="/Users/timax/clawdeals-rehearsal-aRRRAgId/catalog-review/source-catalog.json";
const LOGROOT="/Users/timax/Projects/clawdeals-migration-backups/network-fixture";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const cleanEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,LANG:"en_US.UTF-8"};
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function repositoryFunction(file,name) {
 const sql=fs.readFileSync(file,"utf8");const m=sql.match(new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$\\$;`,"i"));
 if(!m)throw new Error("Repository replacement missing");return m[0];
}
function sourceFunctionSpan(sql,name) {
 const start=sql.indexOf(`CREATE FUNCTION public.${name}(`);if(start<0)throw new Error("Source function missing");
 const tagMatch=sql.slice(start).match(/\bAS (\$[a-zA-Z_0-9]*\$)/);if(!tagMatch)throw new Error("Unexpected source routine quoting");
 const bodyStart=start+tagMatch.index+tagMatch[0].length;const end=sql.indexOf(tagMatch[1]+";",bodyStart);if(end<0)throw new Error("Source routine terminator missing");
 return {start,end:end+tagMatch[1].length+1};
}
async function assertNetworkDenied() {
 await new Promise((resolve,reject)=>{const socket=net.connect({host:"127.0.0.1",port:9});socket.on("connect",()=>{socket.destroy();reject(new Error("Network confinement missing"));});socket.on("error",e=>e.code==="EPERM"?resolve():reject(new Error("Expected OS network denial, not ordinary connectivity error")));socket.setTimeout(2000,()=>{socket.destroy();reject(new Error("Network denial preflight timed out"));});});
}
async function confined() {
 if(sha(fs.readFileSync(PROFILE))!==PROFILE_SHA)throw new Error("Profile changed");
 await assertNetworkDenied();
 const rootStat=fs.lstatSync(ROOT);if(rootStat.isSymbolicLink()||rootStat.uid!==process.getuid()||(rootStat.mode&0o077))throw new Error("Unsafe proof directory");
 for(const suffix of ["", ".lock"])if(fs.existsSync(path.join(ROOT,".s.PGSQL.5432"+suffix)))throw new Error("Existing server/socket refused");
 const schemaBytes=fs.readFileSync(SOURCE), canonicalBytes=fs.readFileSync(CANONICAL);
 if(sha(schemaBytes)!=="278840d0158e3f26895860e96e019265bfec8c3a35e1cf7e270db31bc7693d0d"||sha(canonicalBytes)!=="e8dc9ea399f44d60ce891f842127d2d97ce6bffcf3c1114be1e6a8a55fefc8ef")throw new Error("Artifact binding mismatch");
 const catalogBytes=fs.readFileSync(CATALOG);
 if(sha(catalogBytes)!=="e00218c5ae94517cafb356b06337539d2a778d275c890687b047795829506491")throw new Error("Catalog binding mismatch");
 const catalog=JSON.parse(catalogBytes);
 const canonical=JSON.parse(canonicalBytes);const runRoot=fs.mkdtempSync(path.join(ROOT,"schema-data-"));const data=path.join(runRoot,"data");
 const report={profile_sha256:PROFILE_SHA,source_schema_sha256:sha(schemaBytes),canonical_sha256:sha(canonicalBytes),data_directory:data,stages:[],routine_hash_drift:[],review_only:true,source_rows_imported:false,cutover_eligible:false};
 const output=path.join(LOGROOT,`schema-composition-${Date.now()}.json`);let started=false;
 function command(name,args,input,stage,{allowFailure=false}={}) {
  const r=spawnSync(path.join(PG,name),args,{input,env:cleanEnv,encoding:"utf8",timeout:120000,maxBuffer:8*1024*1024});
  if(r.status!==0){
   // Retain metadata-only failure, never statements/function bodies or values.
   const errorLine=(r.stderr||"").split("\n").find(l=>/ERROR:|FATAL:/.test(l))||"subprocess failed";
   const safe=errorLine.replace(/'[^']*'/g,"'<redacted>'").slice(0,220);
   report.stages.push({stage,status:allowFailure?"expected-denial-or-failure":"failed",exit:r.status,error:safe});
   if(!allowFailure)throw new Error(`${stage} failed (see protected metadata report)`);
  }return r;
 }
 function sql(statement,{user="schema_restore",database="composition",stage="sql",allowFailure=false}={}) {
  return command("psql",["-X","-h",ROOT,"-p","5432","-U",user,"-d",database,"-At","-v","ON_ERROR_STOP=1","-f","-"],statement,stage,{allowFailure});
 }
 const admin=(statement,stage,database="postgres")=>sql(statement,{user:"fixture_admin",database,stage});
 const stage=(name,fn)=>{const result=fn();report.stages.push({stage:name,status:"passed"});return result;};
 try {
  stage("utf8-initdb",()=>command("initdb",["-D",data,"-A","trust","--no-locale","--encoding=UTF8","--username=fixture_admin"],null,"initdb"));
  stage("confined-start",()=>command("pg_ctl",["-D",data,"-l",path.join(runRoot,"server.log"),"-o",`-h '' -k ${ROOT} -p 5432 -c log_min_error_statement=panic -c log_error_verbosity=terse`,"-w","start"],null,"start"));started=true;
  stage("restricted-role-bootstrap",()=>admin(`CREATE ROLE schema_restore LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE clawdeals_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE clawdeals_functions NOLOGIN NOINHERIT; CREATE ROLE clawdeals_maintenance NOLOGIN NOINHERIT; CREATE ROLE clawdeals_consent NOLOGIN NOINHERIT; CREATE ROLE clawdeals_schema_owner NOLOGIN NOINHERIT;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE DATABASE composition OWNER schema_restore ENCODING 'UTF8'; CREATE DATABASE binding_probe OWNER schema_restore ENCODING 'UTF8';`,"bootstrap"));
  for(const db of ["composition","binding_probe"])stage(`extensions-${db}`,()=>admin(`CREATE SCHEMA extensions; CREATE EXTENSION postgis WITH SCHEMA extensions VERSION '3.3.7'; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; GRANT USAGE ON SCHEMA extensions TO schema_restore; REVOKE TEMP ON DATABASE ${db} FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC;`,"extensions",db));
  const privilege=stage("restricted-principal-preflight",()=>sql(`SELECT current_user=session_user AND current_user='schema_restore'; SELECT NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls AND NOT rolreplication FROM pg_roles WHERE rolname=current_user; SELECT NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user));`,{stage:"restricted-preflight"}).stdout.trim());
  if(privilege!=="t\nt\nt")throw new Error("Restricted authenticated principal proof failed");
  for(const statement of ["SELECT pg_read_file('/etc/hosts');","COPY (SELECT 1) TO PROGRAM '/usr/bin/true';","SET ROLE fixture_admin;","RESET SESSION AUTHORIZATION; SELECT current_user='schema_restore';"]){
   const result=sql(statement,{stage:"negative-capability",allowFailure:true});
   if(statement.startsWith("RESET")){if(result.status!==0||result.stdout.trim()!=="RESET\nt")throw new Error("Authenticated admin escape detected");}
   else if(result.status===0)throw new Error("Forbidden restore capability allowed");
  }
  report.stages.push({stage:"denied-file-program-admin-capabilities",status:"passed"});
  let schema=schemaBytes.toString("utf8");
  const enums=[...schema.matchAll(/CREATE TYPE public\.[a-z_][a-z0-9_]* AS ENUM \([\s\S]*?\n\);/g)].map(m=>m[0]);if(enums.length!==33)throw new Error("Unexpected enum inventory");
  sql(enums.join("\n")+"\nCREATE TABLE public.evidence_upload_reservations(binding_probe_only boolean);",{database:"binding_probe",stage:"probe-enum-and-composite-identities"});
  const replacements=[
   ["begin_evidence_upload_confirmation_v1","supabase/migrations/20260713095350_evidence_upload_reservations_v1.sql"],
   ["transaction_request_contact_reveal_v1","supabase/migrations/20260826153000_ti_370_bilateral_contact_reveal.sql"]
  ];
  for(const [name,file] of replacements){
   const definition=repositoryFunction(file,name);
   const canonicalRecord=canonical.routines.find(r=>r.schema==="public"&&r.name===name);
   const body=text=>{const match=text.match(/\bAS\s+(\$[a-zA-Z_0-9]*\$)/i);if(!match)throw new Error("Routine body delimiter missing");return text.slice(match.index+match[0].length).split(match[1])[0];};
   const literals=text=>[...text.matchAll(/'(?:''|[^'])*'/g)].map(m=>m[0]);
   const fromRepository=literals(body(definition)),fromCanonical=literals(body(canonicalRecord.definition_review));
   if(fromRepository.length!==fromCanonical.length)throw new Error("Masked routine literal inventory differs");
   const masked=fromCanonical.map((value,index)=>({value,index})).filter(x=>/REDACTED_FOR_REVIEW_[0-9]+/.test(x.value));
   if(masked.length!==1)throw new Error("Expected exactly one attested masked literal");
   const reconstructed=canonicalRecord.definition_review.replace(masked[0].value,()=>fromRepository[masked[0].index]);
   if(sha(Buffer.from(reconstructed,"utf8"))!==canonicalRecord.definition_sha256)throw new Error("Exact reconstructed canonical bytes mismatch before DDL");
   report.stages.push({stage:`exact-byte-precheck-${name}`,status:"passed"});
   sql("SET check_function_bodies=false;\n"+definition,{database:"binding_probe",stage:`bind-${name}`});
   const actual=sql(`SET search_path=pg_catalog,public; SELECT encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${quote(name)};`,{database:"binding_probe",stage:"replacement-hash"}).stdout.trim().split("\n").at(-1);
   const expected=canonical.routines.find(r=>r.schema==="public"&&r.name===name)?.definition_sha256;if(actual!==expected)throw new Error(`Repository canonical mismatch: ${name}`);
   const span=sourceFunctionSpan(schema,name);schema=schema.slice(0,span.start)+definition+schema.slice(span.end);report.stages.push({stage:`canonical-replacement-${name}`,status:"passed"});
  }
  if(/REDACTED_FOR_REVIEW_[0-9]+/.test(schema))throw new Error("Unresolved redaction");
  // Exact pg_dump bootstrap adjustment for the already-existing fresh public schema.
  if(schema.split("CREATE SCHEMA public;").length!==2)throw new Error("Unexpected public schema declaration");
  schema=schema.replace("CREATE SCHEMA public;","CREATE SCHEMA IF NOT EXISTS public;");
  stage("full-schema-only-restore",()=>sql(schema,{stage:"schema-restore"}));
  const actual=JSON.parse(sql(`SET search_path=pg_catalog,public; SELECT json_agg(json_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'sha',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p');`,{stage:"all-routine-hashes"}).stdout.trim().split("\n").at(-1));
  for(const expected of canonical.routines){const found=actual.filter(r=>r.schema===expected.schema&&r.name===expected.name&&r.args===expected.identity_arguments);if(found.length!==1||found[0].sha!==expected.definition_sha256)report.routine_hash_drift.push({schema:expected.schema,name:expected.name,identity_arguments:expected.identity_arguments,expected_sha256:expected.definition_sha256,actual_sha256:found.map(f=>f.sha)});}
  report.routine_count=actual.length;if(actual.length!==84||report.routine_hash_drift.length)throw new Error("Canonical routine drift before overlays");
  report.stages.push({stage:"84-routine-canonical-equality-before-overlays",status:"passed"});
  // Stable identities, never source OIDs/owners. All comparisons precede overlays.
  const inventoryQuery=`SET search_path=pg_catalog,public;
SELECT json_build_object(
 'routines',(SELECT json_agg(json_build_object('schema',n.nspname,'name',p.proname,'kind',p.prokind,'args',pg_get_function_identity_arguments(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private')),
 'policies',(SELECT json_agg(json_build_object('schema',n.nspname,'relation',c.relname,'name',p.polname)) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private')),
 'objects',(SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'relispartition',c.relispartition)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private')),
 'types',(SELECT json_agg(json_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype)) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','private')),
 'partitions',(SELECT json_agg(json_build_object('child_schema',cn.nspname,'child',c.relname,'parent_schema',pn.nspname,'parent',p.relname,'sequence',i.inhseqno)) FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace JOIN pg_class p ON p.oid=i.inhparent JOIN pg_namespace pn ON pn.oid=p.relnamespace WHERE cn.nspname IN ('public','private')),
 'triggers',(SELECT json_agg(json_build_object('schema',n.nspname,'relation',c.relname,'name',t.tgname,'internal',t.tgisinternal,'enabled',t.tgenabled,'function_schema',fn.nspname,'function_name',f.proname,'function_identity_arguments',pg_get_function_identity_arguments(f.oid),'definition_sha256',encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex'))) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc f ON f.oid=t.tgfoid JOIN pg_namespace fn ON fn.oid=f.pronamespace WHERE n.nspname IN ('public','private')),
 'constraints',(SELECT json_agg(json_build_object('schema',n.nspname,'relation',c.relname,'name',k.conname,'kind',k.contype,'inherited',k.conparentid<>0)) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private')),
 'extension_members',(SELECT count(*) FROM pg_depend d JOIN pg_class c ON d.classid='pg_class'::regclass AND c.oid=d.objid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE d.deptype='e' AND n.nspname IN ('public','private')));`;
  const before=JSON.parse(sql(inventoryQuery,{stage:"pre-overlay-object-inventory"}).stdout.trim().split("\n").at(-1));
  report.object_inventory={catalog_sha256:sha(catalogBytes),comparisons:{},exclusions:["Internal trigger names and definition hashes contain source OIDs; compare stable relation/function/enabled multiset instead", "Source catalog lacks canonical table/column/view/index/constraint/type definition hashes; identity equality is not definition equality", "Owners/ACLs are intentionally changed by reviewed overlays; not part of identity equality", "Extensions outside public/private are separately bootstrapped, not source-restored"]};
  const project=(row,keys)=>JSON.stringify(keys.map(key=>row[key]));
  function compare(label,expected,found,keys){
   const a=expected.map(r=>project(r,keys)).sort(),b=found.map(r=>project(r,keys)).sort();
   const equal=JSON.stringify(a)===JSON.stringify(b);
   report.object_inventory.comparisons[label]={source_count:a.length,restored_count:b.length,equal,fields:keys,missing:a.filter(k=>!b.includes(k)).map(JSON.parse),unexpected:b.filter(k=>!a.includes(k)).map(JSON.parse)};
   if(!equal)throw new Error(`Source object inventory mismatch: ${label}`);
  }
  compare("relations-including-indexes-and-views",catalog.objects,before.objects,["schema","name","kind","relispartition"]);
  compare("types-including-array-and-row-types",catalog.types,before.types,["schema","name","kind"]);
  compare("table-and-index-partition-attachments",catalog.partitions,before.partitions,["child_schema","child","parent_schema","parent","sequence"]);
  compare("noninternal-triggers-including-partition-clones",catalog.triggers.filter(t=>!t.internal),before.triggers.filter(t=>!t.internal),["schema","relation","name","enabled","function_schema","function_name","function_identity_arguments","definition_sha256"]);
  compare("internal-trigger-stable-multiset",catalog.triggers.filter(t=>t.internal),before.triggers.filter(t=>t.internal),["schema","relation","enabled","function_schema","function_name","function_identity_arguments"]);
  const sourceConstraints=[...schemaBytes.toString("utf8").matchAll(/^-- Name: ([^\n]+); Type: (CONSTRAINT|FK CONSTRAINT); Schema: (public|private); Owner: [^\n]+$/gm)].map(m=>{const split=m[1].indexOf(" ");if(split<1)throw new Error("Constraint header identity missing relation");return {schema:m[3],relation:m[1].slice(0,split),name:m[1].slice(split+1)};});
  for(const table of schemaBytes.toString("utf8").matchAll(/CREATE TABLE (public|private)\.([a-z_][a-z0-9_]*) \([\s\S]*?\n\);/g)){
   for(const constraint of table[0].matchAll(/^    CONSTRAINT ([a-z_][a-z0-9_]*) CHECK /gm))sourceConstraints.push({schema:table[1],relation:table[2],name:constraint[1]});
  }
  // Dump emits parent constraints explicitly; inherited partition clones are catalog-generated.
  const constraintKeys=["schema","relation","name"],explicitConstraintIds=new Set(sourceConstraints.map(c=>project(c,constraintKeys)));
  compare("explicit-dump-constraint-identities",sourceConstraints,before.constraints.filter(c=>explicitConstraintIds.has(project(c,constraintKeys))),constraintKeys);
  const unaccounted=before.constraints.filter(c=>!c.inherited&&!explicitConstraintIds.has(project(c,constraintKeys)));
  if(unaccounted.length)throw new Error("Unexpected noninherited constraint outside dump identities");
  report.object_inventory.inherited_constraint_count=before.constraints.filter(c=>c.inherited).length;
  report.object_inventory.application_extension_members=before.extension_members;
  if(before.extension_members!==0)throw new Error("Unexpected extension-owned application relation");
  report.stages.push({stage:"source-stable-object-inventory-before-overlays",status:"passed"});
  function candidate(file,user="fixture_admin") {
   let text=fs.readFileSync(`scripts/migration/${file}`,"utf8");if((text.match(/^ROLLBACK;/gm)||[]).length!==1)throw new Error("Candidate final rollback contract changed");
   text=text.replace(/^ROLLBACK;[^\n]*$/m,"COMMIT; -- isolated composition test only");return sql(text,{user,stage:file});
  }
  stage("queue-overlay-before-business-calls",()=>candidate("neon-queue-runtime.sql","schema_restore"));
  stage("public-lockdown",()=>admin("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public,private FROM PUBLIC; REVOKE ALL ON ALL TABLES IN SCHEMA public,private FROM PUBLIC; REVOKE ALL ON SCHEMA private FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC;","lockdown","composition"));
  // RPC guard expects original invoker definitions, so apply before deliberate queue ownership/definer replacements.
  for(const file of ["neon-rpc-role-review.sql","neon-queue-role-plan.sql","neon-partition-role-plan.sql","neon-contact-consent-role-plan.sql","neon-direct-table-role-plan.sql","neon-acquisition-role-plan.sql","neon-view-role-plan.sql","neon-residual-ownership-role-plan.sql"])stage(`compose-${file}`,()=>candidate(file));
  for(const mutation of ["ALTER POLICY deny_all_anon_authenticated ON public.connect_sessions USING (true);","ALTER POLICY deny_all_anon_authenticated ON public.connect_sessions TO service_role;"]){
   const retirement=fs.readFileSync("scripts/migration/neon-source-policy-retirement.sql","utf8").replace("BEGIN;",`BEGIN;\n${mutation}`);
   const rejected=sql(retirement,{user:"fixture_admin",stage:"reject-mutated-source-policy",allowFailure:true});
   if(rejected.status===0)throw new Error("Changed source policy was accepted");
  }
  stage("retire-exact-source-deny-policies",()=>candidate("neon-source-policy-retirement.sql"));
  stage("drop-fixture-only-bootstrap-roles",()=>admin("DROP ROLE anon; DROP ROLE authenticated; DROP ROLE service_role;","drop-fixture-bootstrap-roles"));
  report.bootstrap_roles_remaining=JSON.parse(admin("SELECT coalesce(json_agg(rolname),'[]'::json) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');","bootstrap-role-absence").stdout.trim());
  if(report.bootstrap_roles_remaining.length)throw new Error("Fixture bootstrap role remains");
  report.provider_reference_scan=JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid))),'[]'::json) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) ELSE '' END ~* '(auth[.]|net[.]|vault[.]|\\manon\\M|\\mauthenticated\\M|\\mservice_role\\M)';`,{user:"fixture_admin",stage:"remaining-provider-reference-scan"}).stdout.trim());
  const after=JSON.parse(sql(inventoryQuery,{user:"fixture_admin",stage:"post-overlay-object-inventory"}).stdout.trim().split("\n").at(-1));
  report.overlay_object_changes={};
  for(const [category,keys] of Object.entries({routines:["schema","name","kind","args"],policies:["schema","relation","name"],objects:["schema","name","kind"],types:["schema","name","kind"],partitions:["child_schema","child","parent_schema","parent"],triggers:["schema","relation","name"],constraints:["schema","relation","name"]})){
   const baseline=new Set(before[category].map(r=>project(r,keys))),final=new Set(after[category].map(r=>project(r,keys)));
   report.overlay_object_changes[category]={identity_fields:keys,added:[...final].filter(k=>!baseline.has(k)).map(JSON.parse),removed:[...baseline].filter(k=>!final.has(k)).map(JSON.parse)};
  }
  const runtimeSource=fs.readFileSync("src/server/db/neon.ts","utf8");
  const runtimeQuery=runtimeSource.match(/getNeonSql\(\)\.query\(`(SELECT r\.rolsuper[\s\S]*?)`, \[\]\)/)?.[1];
  if(!runtimeQuery)throw new Error("Actual app runtime guard extraction failed");
  report.app_runtime_flags=JSON.parse(sql(`SELECT row_to_json(flags) FROM (${runtimeQuery}) AS flags;`,{user:"clawdeals_app",stage:"actual-app-runtime-guard"}).stdout.trim());
  if(Object.values(report.app_runtime_flags).some(value=>value!==false))throw new Error("Actual app runtime role guard refused composed roles");
  report.public_execute_routines=JSON.parse(sql("SELECT coalesce(json_agg(n.nspname||'.'||p.proname),'[]'::json) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname IN ('public','private') AND a.grantee=0 AND a.privilege_type='EXECUTE';",{user:"fixture_admin",stage:"public-execute-audit"}).stdout.trim());
  if(report.public_execute_routines.length)throw new Error("Unreviewed PUBLIC routine EXECUTE remains");
  report.restore_owner_objects=JSON.parse(sql("SELECT json_build_object('relations',(SELECT coalesce(json_agg(n.nspname||'.'||c.relname),'[]'::json) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m','S') AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname='schema_restore')),'routines',(SELECT coalesce(json_agg(n.nspname||'.'||p.proname),'[]'::json) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='schema_restore')),'enum_types',(SELECT coalesce(json_agg(n.nspname||'.'||t.typname),'[]'::json) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','private') AND t.typtype='e' AND t.typowner=(SELECT oid FROM pg_roles WHERE rolname='schema_restore')));",{user:"fixture_admin",stage:"restore-owner-residual"}).stdout.trim());
  report.target_ownership=JSON.parse(sql("SELECT json_build_object('database_owner',pg_get_userbyid(datdba),'restore_can_login',(SELECT rolcanlogin FROM pg_roles WHERE rolname='schema_restore'),'application_schema_owners',(SELECT json_object_agg(nspname,pg_get_userbyid(nspowner)) FROM pg_namespace WHERE nspname IN ('public','private'))) FROM pg_database WHERE datname=current_database();",{user:"fixture_admin",stage:"final-target-ownership"}).stdout.trim());
  if(report.target_ownership.database_owner!=="clawdeals_schema_owner"||report.target_ownership.restore_can_login!==false||Object.values(report.target_ownership.application_schema_owners).some(owner=>owner!=="clawdeals_schema_owner"))throw new Error("Temporary restore ownership/login remains on target");
  if(Object.values(report.restore_owner_objects).some(objects=>objects.length))throw new Error("Restore-owned application objects remain");
  stage("app-real-table-default-smoke",()=>sql("BEGIN; INSERT INTO public.watchlist_signups(email,locale,source) VALUES('schema-fixture@example.invalid','en','confined-fixture') RETURNING id IS NOT NULL AND created_at IS NOT NULL; ROLLBACK;",{user:"clawdeals_app",stage:"app-table-default-smoke"}));
  stage("app-view-smoke",()=>sql("SELECT count(*) FROM public.ops_obs_queue_depth_gauges_v1;",{user:"clawdeals_app",stage:"app-view-smoke"}));
  const helper=sql("SELECT public.connect_effective_scopes_v1(ARRAY['listings:read']);",{user:"clawdeals_app",stage:"app-scope-helper-smoke",allowFailure:true});
  report.scope_helper_executable=helper.status===0;
  const geo=sql("SELECT count(*) FROM public.list_listings_geo_v1(p_lat=>0::double precision,p_lng=>0::double precision);",{user:"clawdeals_app",stage:"app-postgis-rpc-smoke",allowFailure:true});
  report.extension_schema_usage=sql("SELECT has_schema_privilege(current_user,'extensions','USAGE');",{user:"clawdeals_app",stage:"app-extension-usage"}).stdout.trim()==="t";
  if(geo.status!==0||helper.status!==0)throw new Error("Runtime smoke residuals: helper EXECUTE and/or PostGIS extension/search_path closure");
  report.status="schema-and-role-candidates-composed";
 }catch(error){report.status="blocked";report.blocker=error.message;}
 finally{
  if(started){const stopped=command("pg_ctl",["-D",data,"-m","fast","-w","stop"],null,"stop",{allowFailure:true});report.server_stopped=stopped.status===0;}
  fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600,flag:"wx"});
  console.log(JSON.stringify({status:report.status,report:output,blocker:report.blocker,server_stopped:report.server_stopped}));
 }
 if(report.status!=="schema-and-role-candidates-composed")process.exitCode=1;
}
if(process.argv.includes("--confined-child"))await confined();
else test("confined full schema-only and reviewed role composition",{skip:process.env.RUN_CONFINED_SCHEMA_COMPOSITION!=="1"&&"Explicit local schema-composition opt-in required"},()=>{
 const child=spawnSync("/usr/bin/sandbox-exec",["-f",PROFILE,process.execPath,fileURLToPath(import.meta.url),"--confined-child"],{cwd:process.cwd(),env:cleanEnv,encoding:"utf8",timeout:300000,maxBuffer:1024*1024});
 console.log(child.stdout.trim());assert.equal(child.status,0,child.stderr||"Composition blocked; inspect metadata report");
});
