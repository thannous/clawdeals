import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { renderRpcRoleReview } from "./render-rpc-role-review.mjs";
const fixtureReview = hash => ({format:"clawdeals-authorization-review-v1",executable:false,restore_eligible:false,catalog_sha256:"fixture-only",rendering_context:{search_path:"pg_catalog, public",evidence:"native-fixture-explicit-setting"},routines:[{identity:{schema:"public",name:"connect_effective_scopes_v1",identity_arguments:"p_requested_scopes text[]"},disposition:"server-invoker-candidate",source_security_definer:false,source_definition_sha256:hash}]});
test("SQL candidate always rolls back, excludes dedicated ownership and refuses unhashed definitions",()=>{
 const r=fixtureReview("a".repeat(64));r.routines.push({...r.routines[0],identity:{...r.routines[0].identity,name:"queue_drain_claim_v1"}});
 const sql=renderRpcRoleReview(r);assert.match(sql,/ROLLBACK;\n$/);assert.ok(!sql.includes("'queue_drain_claim_v1'"));assert.ok(!sql.includes("ALL FUNCTIONS"));
 assert.throws(()=>renderRpcRoleReview(fixtureReview("bad")));
});
const bin=process.env.PG_FIXTURE_BIN;
test("native actual repository invoker routine grants are hash-gated and rollback restores ACL/owner",{skip:!bin&&"PG_FIXTURE_BIN required"},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"rpc-role-review-")),data=path.join(root,"data"),socket=path.join(root,"socket");fs.mkdirSync(socket);
 const run=(name,args,input)=>spawnSync(path.join(bin,name),args,{input,encoding:"utf8",timeout:30000});
 const checked=(name,args,input)=>{const r=run(name,args,input);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};let started=false;
 try {
  checked("initdb",["-D",data,"--auth=trust","--no-locale","--username=fixture_owner"]);
  checked("pg_ctl",["-D",data,"-l",path.join(root,"server.log"),"-o",`-c listen_addresses='' -c unix_socket_directories='${socket}'`,"-w","start"]);started=true;
  const args=["-X","-h",socket,"-U","fixture_owner","-d","postgres","-At","-v","ON_ERROR_STOP=1"];
  const query=sql=>checked("psql",[...args,"-c",sql]);
  const repository=fs.readFileSync("supabase/migrations/20261022090000_connect_exchange_consent_scopes.sql","utf8");
  const definition=repository.match(/create or replace function public\.connect_effective_scopes_v1[\s\S]*?\$\$;/i)?.[0];assert.ok(definition);
  query("CREATE ROLE clawdeals_app NOINHERIT; CREATE ROLE clawdeals_schema_owner NOLOGIN NOINHERIT;"+definition+" REVOKE ALL ON FUNCTION public.connect_effective_scopes_v1(text[]) FROM PUBLIC;");
  const hash=query("SET search_path=pg_catalog,public; SELECT encode(sha256(convert_to(pg_get_functiondef('public.connect_effective_scopes_v1(text[])'::regprocedure),'UTF8')),'hex');").split("\n").at(-1);
  query("CREATE TYPE public.fixture_enum AS ENUM ('one'); CREATE FUNCTION public.enum_check(p_value public.fixture_enum) RETURNS text LANGUAGE sql AS 'SELECT p_value::text'; CREATE FUNCTION public.enum_check(p_value text) RETURNS text LANGUAGE sql AS 'SELECT p_value'; REVOKE ALL ON FUNCTION public.enum_check(public.fixture_enum),public.enum_check(text) FROM PUBLIC;");
  const enumRows=JSON.parse(query("SET search_path=pg_catalog,public; SELECT json_agg(json_build_object('args',pg_get_function_identity_arguments(oid),'hash',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex'))) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='enum_check';").split("\n").at(-1));
  const review=fixtureReview(hash);
  for(const row of enumRows) review.routines.push({identity:{schema:"public",name:"enum_check",identity_arguments:row.args},disposition:"server-invoker-candidate",source_security_definer:false,source_definition_sha256:row.hash});
  const script=renderRpcRoleReview(review);
  const assertions=`SET LOCAL ROLE clawdeals_app;
SELECT public.connect_effective_scopes_v1(ARRAY['listings:read'])=ARRAY['listings:read'];
SELECT public.connect_effective_scopes_v1(ARRAY['unapproved:scope']) IS NULL;
SELECT public.enum_check('one'::public.fixture_enum)='one';
SELECT public.enum_check('text'::text)='text';
RESET ROLE;
ROLLBACK;`;
  const output=checked("psql",[...args,"-f","-"],"SET search_path=pg_temp;\n"+script.replace(/ROLLBACK;\n$/,assertions));assert.match(output,/t\nt/);
  assert.equal(query("SELECT has_function_privilege('clawdeals_app','public.connect_effective_scopes_v1(text[])','EXECUTE')"),"f");
  assert.equal(query("SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.connect_effective_scopes_v1(text[])'::regprocedure"),"fixture_owner");
  checked("psql",[...args,"-f","-"],"SET search_path=public,pg_catalog;\n"+script);
  query("CREATE OR REPLACE FUNCTION public.enum_check(p_value public.fixture_enum) RETURNS text LANGUAGE sql AS 'SELECT upper(p_value::text)';");
  assert.notEqual(run("psql",[...args,"-f","-"],script).status,0);
  assert.notEqual(run("psql",[...args,"-f","-"],renderRpcRoleReview(fixtureReview("a".repeat(64)))).status,0);
  assert.equal(query("SELECT has_function_privilege('clawdeals_app','public.connect_effective_scopes_v1(text[])','EXECUTE')"),"f");
 } finally {if(started)checked("pg_ctl",["-D",data,"-m","fast","-w","stop"]);fs.rmSync(root,{recursive:true,force:true});}
});
