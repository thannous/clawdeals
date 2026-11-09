import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectServerRpcCalls, buildAuthorizationReview } from "./authorization-review.mjs";
import { sha256 } from "./transfer-contract.mjs";
function input() {
 const catalog = { routines: [
  {schema:"public",name:"lookup",kind:"f",identity_arguments:"p_id uuid",owner:"postgres",security_definer:false,acl:["=X/postgres"]},
  {schema:"public",name:"change",kind:"f",identity_arguments:"p_id uuid",owner:"postgres",security_definer:true,acl:[]},
  {schema:"private",name:"helper",kind:"f",identity_arguments:"",owner:"postgres",security_definer:false,acl:[]}
 ], objects:[{schema:"public",name:"items",kind:"r"},{schema:"private",name:"state",kind:"r"},{schema:"public",name:"items_view",kind:"v"}],default_acl:[{role:"postgres",schema:"public",object_type:"f"}],policies:[{schema:"public",relation:"items",name:"client_policy",roles:["authenticated"],command:"r"}] };
 const catalogBytes=Buffer.from(JSON.stringify(catalog));
 return {catalogBytes,expectedCatalogSha256:sha256(catalogBytes),census:{calls:[{name:"lookup",file:"src/server/service.ts"},{name:"change",file:"src/server/service.ts"}],dynamic:[]},inventory:{artifact_sha256:sha256("review"),objects:[{schema:"public",kind:"FUNCTION",name:"lookup(uuid)",textual_references:["public.items"]}]}};
}
test("exact invoker signature candidate requires static server evidence; private/definer not auto-granted",()=>{
 const r=buildAuthorizationReview(input());
 assert.equal(r.routines[0].runtime_execute,"candidate-exact-signature-clawdeals_app");
 assert.equal(r.routines[1].runtime_execute,"withhold-until-specific-review");
 assert.equal(r.routines[2].runtime_execute,"withhold-until-specific-review");
 assert.deepEqual(r.routines[0].qualified_table_paths,["public.items"]);
 assert.equal(r.executable,false);assert.equal(r.restore_eligible,false);
 assert.equal(r.relation_decisions[1].runtime_grants,"none-direct; exact-definer-role-only");
 assert.match(r.policy_decisions[0].missing,/not claim DB tenant isolation/);
 assert.equal(r.default_acl_decisions[0].action,"do-not-copy");
 assert.equal(r.views.length,1);
});
test("overload ambiguity invalidates candidate grants rather than matching bare name",()=>{
 const i=input(),c=JSON.parse(i.catalogBytes);c.routines.push({...c.routines[0],identity_arguments:"p_id text"});i.catalogBytes=Buffer.from(JSON.stringify(c));i.expectedCatalogSha256=sha256(i.catalogBytes);
 const r=buildAuthorizationReview(i);assert.equal(r.routines[0].runtime_execute,"withhold-until-specific-review");assert.equal(r.routines[3].runtime_execute,"withhold-until-specific-review");
});
test("catalog mismatch refuses; missing RPC is visible",()=>{
 const i=input();i.census.calls.push({name:"missing"});assert.deepEqual(buildAuthorizationReview(i).missing_source_rpc_names,["missing"]);
 i.expectedCatalogSha256=sha256("other");assert.throws(()=>buildAuthorizationReview(i),/binding mismatch/);
});
test("AST census excludes tests, catches literal RPCs and surfaces dynamic names",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"authorization-review-"));
 try {
  fs.mkdirSync(path.join(root,"src/server"),{recursive:true});fs.mkdirSync(path.join(root,"src/pages/api"),{recursive:true});
  fs.writeFileSync(path.join(root,"src/server/a.ts"),'client.rpc("lookup", { p_id: id }); client.rpc(variable, args);');
  fs.writeFileSync(path.join(root,"src/server/a.test.ts"),'client.rpc("test_only", {});');
  const r=collectServerRpcCalls(root);assert.equal(r.calls.length,1);assert.deepEqual(r.calls[0].argument_names,["p_id"]);assert.equal(r.dynamic.length,1);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test("explicit named argument sets resolve intended overloads independently",()=>{
 const i=input(),c=JSON.parse(i.catalogBytes);c.routines.push({...c.routines[0],identity_arguments:"p_id uuid, p_reason text"});i.catalogBytes=Buffer.from(JSON.stringify(c));i.expectedCatalogSha256=sha256(i.catalogBytes);
 i.census.calls=[{name:"lookup",argument_names:["p_id"]},{name:"lookup",argument_names:["p_id","p_reason"]}];
 const r=buildAuthorizationReview(i);assert.equal(r.routines[0].runtime_execute,"candidate-exact-signature-clawdeals_app");assert.equal(r.routines[3].runtime_execute,"candidate-exact-signature-clawdeals_app");
});
