import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
const bin=process.env.PG_FIXTURE_BIN;
const migration = name => fs.readFileSync(`supabase/migrations/${name}.sql`,"utf8");
function definition(text,name) {
 const escaped=name.replaceAll(".","\\.");
 const match=text.match(new RegExp(`create(?: or replace)? function ${escaped}\\([\\s\\S]*?\\$\\$;`,"i"));
 assert.ok(match,`Missing repository function ${name}`);return match[0];
}
function trigger(text,name) {const m=text.match(new RegExp(`create trigger ${name}\\b[\\s\\S]*?;`,"i"));assert.ok(m,`Missing repository trigger ${name}`);return m[0];}
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
test("native consent actual repository bodies and all listing/approval plus queue triggers",{skip:!bin&&"PG_FIXTURE_BIN required"},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"consent-fixture-")),data=path.join(root,"data"),socket=path.join(root,"socket");fs.mkdirSync(socket);
 const run=(name,args,input)=>spawnSync(path.join(bin,name),args,{input,encoding:"utf8",timeout:30000});
 const checked=(name,args,input)=>{const r=run(name,args,input);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};let started=false;
 try {
  checked("initdb",["-D",data,"--auth=trust","--no-locale","--username=fixture_owner"]);
  checked("pg_ctl",["-D",data,"-l",path.join(root,"server.log"),"-o",`-c listen_addresses='' -c unix_socket_directories='${socket}'`,"-w","start"]);started=true;
  const args=["-X","-h",socket,"-U","fixture_owner","-d","postgres","-At","-v","ON_ERROR_STOP=1"];
  const q=sql=>checked("psql",[...args,"-c",sql]);
  const appArgs=args.map(a=>a==="fixture_owner"?"clawdeals_app":a);
  const app=sql=>checked("psql",[...appArgs,"-c",sql]);
  const deny=(sql,pattern)=>{const r=run("psql",[...appArgs,"-c",sql]);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
  q(`CREATE ROLE clawdeals_app LOGIN NOINHERIT; CREATE ROLE clawdeals_consent NOLOGIN NOINHERIT; CREATE ROLE fixture_trigger_owner NOLOGIN NOINHERIT; CREATE ROLE clawdeals_functions NOLOGIN NOINHERIT; CREATE SCHEMA private;
CREATE TYPE public.approval_state AS ENUM('PENDING','APPROVED','DENIED','CANCELLED'); CREATE TYPE public.transaction_status AS ENUM('ACCEPTED','CONTACT_REVEALED'); CREATE TYPE public.contact_reveal_state AS ENUM('NOT_REQUESTED','REQUESTED','APPROVED','DENIED'); CREATE TYPE public.listing_status AS ENUM('LIVE','CONTACT_REVEALED'); CREATE TYPE public.psp_kyc_status AS ENUM('VERIFIED');
CREATE TABLE public.owners(owner_id uuid PRIMARY KEY,email text,email_verified_at timestamptz,phone_e164 text,phone_verified_at timestamptz);
CREATE TABLE public.agents(id uuid PRIMARY KEY,owner_id uuid);
CREATE TABLE public.transactions(tx_id uuid PRIMARY KEY,listing_id uuid,thread_id uuid,buyer_agent_id uuid,seller_agent_id uuid,status public.transaction_status,contact_reveal_state public.contact_reveal_state,contact_revealed_at timestamptz,updated_at timestamptz);
CREATE TABLE public.approvals(approval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid,action_type text,action_ref jsonb NOT NULL DEFAULT '{}'::jsonb,action_ref_id text,action_payload_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,created_by_agent_id uuid,state public.approval_state DEFAULT 'PENDING',created_at timestamptz DEFAULT now(),resolved_at timestamptz,resolved_by_human_id uuid,resolved_reason_text text,UNIQUE(owner_id,action_type,action_ref_id));
CREATE TABLE public.listings(listing_id uuid PRIMARY KEY,status public.listing_status,updated_at timestamptz,title text,description text,category text,price_amount integer,currency text,market_code text,geo_lat numeric,geo_lng numeric,delivery_method text,seller_agent_id uuid,owner_id uuid,search_tsv tsvector);
CREATE TABLE public.watchlists(watchlist_id uuid PRIMARY KEY,criteria jsonb,deleted_at timestamptz);
CREATE TABLE public.smartphone_mission_match_state(listing_id uuid,watchlist_id uuid,compatible boolean,updated_at timestamptz);
CREATE TABLE public.watchlist_matches(watchlist_id uuid,entity_type text,entity_id uuid);
CREATE TABLE public.watchlist_match_queue(entity_type text,entity_id uuid,last_reason text,attempt_count integer DEFAULT 0,last_error text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),PRIMARY KEY(entity_type,entity_id));
CREATE TABLE public.project_missions(id uuid PRIMARY KEY,catalog_snapshots jsonb,version integer,selected_configuration_id uuid,confirmed_at timestamptz,confirmed_version integer,status text,updated_at timestamptz);
CREATE TABLE private.queue_dispatch_state(queue_name text PRIMARY KEY);
REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO clawdeals_app,clawdeals_consent,fixture_trigger_owner,clawdeals_functions; GRANT USAGE ON SCHEMA private TO clawdeals_functions;
GRANT SELECT,INSERT ON private.queue_dispatch_state TO clawdeals_functions;
ALTER TABLE private.queue_dispatch_state ENABLE ROW LEVEL SECURITY; ALTER TABLE private.queue_dispatch_state FORCE ROW LEVEL SECURITY;
CREATE POLICY fixture_queue_marker ON private.queue_dispatch_state TO clawdeals_functions USING(queue_name='watchlist-match-queue') WITH CHECK(queue_name='watchlist-match-queue');`);
  q(`INSERT INTO public.listings(listing_id,status,price_amount,currency,market_code) VALUES('${uid(20)}','LIVE',100,'USD','US');`);
  const consent=migration("20260826153000_ti_370_bilateral_contact_reveal");
  const approval=migration("20260211101000_ti_332_approval_jobs_and_triggers_v1");
  const search=migration("20260209161000_ti_269_fts_v1");
  const enqueue=migration("20260904093000_ti_510_owner_listing_price_drop_follows");
  const smartphone=migration("20261023152651_smartphone_mission_market_invalidation");
  const smartphoneBase=migration("20261022192326_smartphone_passport_missions_v1");
  const project=migration("20261023163719_project_office_missions_v1");
  const queue=migration("20260928210921_queue_event_dispatch");
  const queueLater=migration("20260928220905_notification_eligibility_schedule");
  q(definition(consent,"public.transaction_request_contact_reveal_v1")+definition(consent,"public.resolve_contact_reveal_consent_v1")+
   definition(approval,"public.approvals_apply_side_effects_v1")+definition(search,"public.listings_search_tsv_update_v1")+definition(enqueue,"public.enqueue_watchlist_match_queue_v1")+definition(smartphone,"public.enqueue_smartphone_mission_change_v1")+definition(project,"public.invalidate_project_missions_v1")+definition(smartphoneBase,"public.advance_watchlist_queue_clock_v1")+definition(queueLater,"private.wake_queue_consumer_v1")+definition(fs.readFileSync("scripts/migration/neon-queue-runtime.sql","utf8"),"private.send_queue_wake_v1")+
   trigger(approval,"approvals_apply_side_effects_v1")+trigger(search,"listings_search_tsv_update_v1_trigger")+trigger(enqueue,"watchlist_match_queue_listings_live_v1")+trigger(smartphoneBase,"smartphone_mission_listing_change")+trigger(project,"project_mission_listing_change")+trigger(smartphoneBase,"watchlist_match_queue_monotonic_clock")+trigger(queue,"watchlist_match_event_dispatch"));
  q("ALTER FUNCTION public.approvals_apply_side_effects_v1() OWNER TO fixture_trigger_owner; ALTER FUNCTION public.enqueue_watchlist_match_queue_v1() OWNER TO fixture_trigger_owner; ALTER FUNCTION private.wake_queue_consumer_v1() OWNER TO clawdeals_functions; ALTER FUNCTION private.send_queue_wake_v1(text) OWNER TO clawdeals_functions; REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public,private FROM PUBLIC;");
  const tables=["owners","agents","transactions","approvals","listings","watchlists","smartphone_mission_match_state","watchlist_matches","watchlist_match_queue","project_missions"];
  for(const t of tables)q(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY; ALTER TABLE public.${t} FORCE ROW LEVEL SECURITY;`);
  const plan=fs.readFileSync("scripts/migration/neon-contact-consent-role-plan.sql","utf8");
  // The repository definitions must render exactly to independently attested
  // canonical source hashes. Never rebind or weaken the candidate guard.
  for(const [name,oldHash] of [["transaction_request_contact_reveal_v1","2df6106f4fc97c01d992c0aac85241ed423ad050ec5546fd11942b70564a49c0"],["resolve_contact_reveal_consent_v1","e841f2b23df9f95075052a1803847510a751c7fbc7df4834ba9a937f833abf1a"]]) {
   const hash=q(`SET search_path=pg_catalog,public; SELECT encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='${name}'`).split("\n").at(-1);assert.equal(hash,oldHash,`Canonical source CREATE wrapper differs for ${name}`);
  }
  checked("psql",[...args,"-f","-"],plan.replace(/ROLLBACK;[^\n]*$/m,"COMMIT; -- synthetic fixture only"));
  q(`INSERT INTO public.owners VALUES('${uid(1)}','buyer@example.invalid',now(),'fixture',now()),('${uid(2)}','seller@example.invalid',now(),'fixture',now()); INSERT INTO public.agents VALUES('${uid(11)}','${uid(1)}'),('${uid(12)}','${uid(2)}');
INSERT INTO public.transactions VALUES('${uid(30)}','${uid(20)}','${uid(40)}','${uid(11)}','${uid(12)}','ACCEPTED','NOT_REQUESTED',null,now());
INSERT INTO public.watchlists VALUES('${uid(50)}','{"mission":{"smartphone":{}}}',null); INSERT INTO public.smartphone_mission_match_state VALUES('${uid(20)}','${uid(50)}',true,now()); INSERT INTO public.watchlist_matches VALUES('${uid(50)}','listing','${uid(20)}');
INSERT INTO public.project_missions VALUES('${uid(60)}','[{"listing_id":"${uid(20)}"}]',1,'${uid(61)}',now(),1,'CONFIRMED',now());`);
  const request=actor=>`SELECT * FROM public.transaction_request_contact_reveal_v1('${uid(30)}','${actor}');`;
  deny(request(uid(99)),/TX_NOT_FOUND/);
  q(`UPDATE public.agents SET owner_id='${uid(1)}' WHERE id='${uid(12)}'`);deny(request(uid(11)),/CONTACT_REVEAL_PARTIES_NOT_DISTINCT/);q(`UPDATE public.agents SET owner_id='${uid(2)}' WHERE id='${uid(12)}'`);
  q(`UPDATE public.owners SET email_verified_at=null WHERE owner_id='${uid(2)}'`);deny(request(uid(11)),/OWNER_CONTACT_MISSING/);q(`UPDATE public.owners SET email_verified_at=now() WHERE owner_id='${uid(2)}'`);
  app(request(uid(11)));assert.equal(q("SELECT count(*) FROM public.approvals"),"2");
  const approvals=q("SELECT owner_id||':'||approval_id FROM public.approvals ORDER BY owner_id").split("\n").map(r=>r.split(":"));
  const resolve=(which,owner,decision)=>`SELECT became_revealed FROM public.resolve_contact_reveal_consent_v1('${approvals[which][1]}','${owner}','${decision}',null);`;
  deny(resolve(0,uid(2),"APPROVED"),/APPROVAL_NOT_FOUND/);
  app(resolve(0,uid(1),"DENIED"));assert.equal(q("SELECT contact_reveal_state FROM public.transactions"),"DENIED");assert.equal(q(`SELECT state FROM public.approvals WHERE owner_id='${uid(2)}'`),"CANCELLED");
  app(request(uid(11)));app(request(uid(11)));assert.equal(q("SELECT count(*) FROM public.approvals"),"2");
  app(resolve(0,uid(1),"APPROVED"));app(resolve(0,uid(1),"REVOKED"));assert.equal(q("SELECT contact_reveal_state FROM public.transactions"),"DENIED");app(request(uid(11)));
  app(resolve(0,uid(1),"APPROVED"));assert.equal(q("SELECT contact_reveal_state FROM public.transactions"),"REQUESTED");
  q(`UPDATE public.owners SET phone_verified_at=null WHERE owner_id='${uid(2)}'`);deny(resolve(1,uid(2),"APPROVED"),/OWNER_CONTACT_MISSING/);assert.equal(q(`SELECT state FROM public.approvals WHERE owner_id='${uid(2)}'`),"PENDING");q(`UPDATE public.owners SET phone_verified_at=now() WHERE owner_id='${uid(2)}'`);
  // Actual nonempty project invalidation must fail atomically without its grant.
  q("REVOKE UPDATE ON public.project_missions FROM clawdeals_consent; REVOKE UPDATE(version,selected_configuration_id,confirmed_at,confirmed_version,status,updated_at) ON public.project_missions FROM clawdeals_consent;");
  deny(resolve(1,uid(2),"APPROVED"),/permission denied for table project_missions/);
  assert.equal(q(`SELECT state FROM public.approvals WHERE owner_id='${uid(2)}'`),"PENDING");assert.equal(q("SELECT contact_reveal_state FROM public.transactions"),"REQUESTED");
  q("GRANT UPDATE(version,selected_configuration_id,confirmed_at,confirmed_version,status,updated_at) ON public.project_missions TO clawdeals_consent;");
  app(resolve(1,uid(2),"APPROVED"));assert.equal(q("SELECT contact_reveal_state FROM public.transactions"),"APPROVED");
  assert.equal(q("SELECT compatible FROM public.smartphone_mission_match_state"),"f");assert.equal(q("SELECT count(*) FROM public.watchlist_matches"),"0");assert.equal(q("SELECT status FROM public.project_missions"),"DRAFT");assert.equal(q("SELECT count(*) FROM private.queue_dispatch_state"),"1");
  app(resolve(1,uid(2),"APPROVED"));assert.equal(q("SELECT version FROM public.project_missions"),"2");deny(resolve(0,uid(1),"REVOKED"),/CONTACT_REVEAL_FINALIZED/);
  // Two independent restricted app sessions contend on the same transaction.
  q("UPDATE public.transactions SET status='ACCEPTED',contact_reveal_state='REQUESTED',contact_revealed_at=null; UPDATE public.approvals SET state='PENDING',resolved_at=null;");
  const concurrent=sql=>new Promise((resolve,reject)=>{const child=spawn(path.join(bin,"psql"),[...appArgs,"-c","SET statement_timeout='10s'; "+sql]);let output="",errors="";child.stdout.on("data",d=>output+=d);child.stderr.on("data",d=>errors+=d);child.on("error",reject);child.on("close",code=>code===0?resolve(output.trim().split("\n").at(-1)):reject(new Error(errors)));});
  const outcomes=await Promise.all([concurrent(resolve(0,uid(1),"APPROVED")),concurrent(resolve(1,uid(2),"APPROVED"))]);
  assert.deepEqual(outcomes.sort(),["f","t"]);assert.equal(q("SELECT version FROM public.project_missions"),"3");assert.equal(q("SELECT count(*) FROM public.watchlist_match_queue"),"1");
  deny("SELECT * FROM public.owners",/permission denied/);deny("SET ROLE clawdeals_consent",/permission denied/);
 } finally {if(started)checked("pg_ctl",["-D",data,"-m","fast","-w","stop"]);fs.rmSync(root,{recursive:true,force:true});}
});
