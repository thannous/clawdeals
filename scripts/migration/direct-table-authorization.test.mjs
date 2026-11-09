import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { deriveDirectTables, renderDirectTableSql } from "./direct-table-authorization.mjs";
const candidate = fs.readFileSync(new URL("./neon-direct-table-role-plan.sql", import.meta.url), "utf8");
test("operation extraction handles continuations, conflict-ignore and excludes RPC/view/acquisition scope", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neon-direct-ast-"));
  try {
    fs.mkdirSync(path.join(root,"src/server"),{recursive:true}); fs.mkdirSync(path.join(root,"src/pages/api"),{recursive:true});
    fs.writeFileSync(path.join(root,"src/server/example.ts"), `
      const q = client.from('deals').select('id'); q.update({id:1});
      client.from('offers').upsert({id:1},{ignoreDuplicates:true});
      client.from('acquisition_funnel_events').upsert({id:1},{ignoreDuplicates:true});
      client.from('acquisition_funnel_summary').select('*');
      client.rpc('ledger_mutation',{}); Array.from([]); client.storage.from('bucket').upload('x');
    `);
    const catalog = {objects:['deals','offers','acquisition_funnel_events','acquisition_funnel_summary'].map(name=>({schema:'public',name,kind:name.endsWith('summary')?'v':'r',relispartition:false,metadata_sha256:'fixture'}))};
    const report = deriveDirectTables(root,catalog);
    assert.deepEqual(report.unresolved,[]);
    assert.deepEqual(report.tables.find(t=>t.name==='deals').operations,['SELECT','UPDATE']);
    assert.deepEqual(report.tables.find(t=>t.name==='offers').operations,['SELECT','INSERT']);
    const sql=renderDirectTableSql(report);
    assert(!sql.includes('GRANT SELECT, INSERT ON TABLE public."acquisition_funnel_events"'));
    assert(!sql.includes('ledger_mutation')); assert(sql.endsWith('ROLLBACK; -- Review candidate: actual dump parity and assembled authorization are not approved.\n'));
    fs.appendFileSync(path.join(root,'src/server/example.ts'),"client.from(unknownTable).delete();");
    assert.throws(()=>renderDirectTableSql(deriveDirectTables(root,catalog)),/Unresolved/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test("stored candidate does not grant global, private, partition, view or acquisition rights",()=>{
  assert(!/GRANT ALL|ON ALL TABLES|GRANT .* ON TABLE private\./i.test(candidate));
  assert(!/GRANT .* ON TABLE public\."(?:audit_logs_\d|acquisition_|ops_)/.test(candidate));
  assert(candidate.includes('FOR DELETE TO clawdeals_app USING (true)'));
  assert(!candidate.includes('FOR ALL')); assert(candidate.includes('ROLLBACK;'));
});
const bin=process.env.PG_FIXTURE_BIN;
test("native PostgreSQL representative direct-table operations retain FORCE RLS and deny ungranted writes/DDL",{skip:!bin&&'Set PG_FIXTURE_BIN to verified official PostgreSQL binaries'},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'neon-direct-native-')),data=path.join(root,'data'),socket=path.join(root,'socket');fs.mkdirSync(socket);let started=false;
  const run=(tool,args,input)=>spawnSync(path.join(bin,tool),args,{input,encoding:'utf8',timeout:30000});
  const check=(tool,args,input)=>{const r=run(tool,args,input);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
  try {
    check('initdb',['-D',data,'--no-locale','--username=fixture_owner']);
    check('pg_ctl',['-D',data,'-l',path.join(root,'server.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${socket}'`,'-w','start']);started=true;
    const args=['-X','-h',socket,'-U','fixture_owner','-d','postgres','-At','-v','ON_ERROR_STOP=1'];
    const query=sql=>check('psql',[...args,'-c',sql]);
    const deny=sql=>{const r=run('psql',[...args,'-c',sql]);assert.notEqual(r.status,0);assert.match(r.stderr,/permission denied|must be owner/);};
    query(`create role clawdeals_app nologin nosuperuser nobypassrls noinherit; create schema private;
      revoke all on schema public,private from public; revoke temporary on database postgres from public,clawdeals_app;
      create table deals(deal_id int primary key,title text); create table deal_votes(deal_id int); create table offers(offer_id int primary key,status text);
      insert into deal_votes values(1);`);
    // Actual checked-in candidate blocks, not a separate permissive fixture policy.
    const pieces=candidate.split(/(?=-- Source identity public\.)/);
    const selected=pieces.filter((part,index)=>index===0||/^-- Source identity public\.(deals|deal_votes|offers);/.test(part)).join('\n');
    check('psql',[...args,'-f','-'],selected.replace(/ROLLBACK;[^\n]*/g,'')+'\nCOMMIT;');
    const asApp=sql=>'set role clawdeals_app; '+sql;
    query(asApp("insert into deals values(1,'first') returning *; update deals set title='second' where deal_id=1 returning *; delete from deals where deal_id=1 returning *"));
    assert.equal(query(asApp('select count(*) from deal_votes')).split('\n').at(-1),'1');
    deny(asApp('insert into deal_votes values(2)'));
    query(asApp("insert into offers values(1,'PENDING') returning *"));
    deny(asApp("update offers set status='ACCEPTED'")); deny(asApp('delete from offers'));
    deny(asApp('create table public.bad(id int)')); deny(asApp('create temporary table bad(id int)')); deny(asApp('alter table deals disable row level security'));
    assert.equal(query("select bool_and(relforcerowsecurity) from pg_class where oid in ('deals'::regclass,'deal_votes'::regclass,'offers'::regclass)"),'t');
    assert.equal(query("select pg_has_role('clawdeals_app','fixture_owner','MEMBER')"),'f');
    query(`create table acquisition_funnel_events(acquisition_id uuid,event_name text,occurred_at timestamptz default now(),cta_location text,interaction_type text,unique(acquisition_id,event_name));
      alter table acquisition_funnel_events enable row level security; alter table acquisition_funnel_events force row level security;
      create policy clawdeals_audit_acquisition_read on acquisition_funnel_events for select to clawdeals_app using(event_name in ('first_match','d7_retained'));
      create policy clawdeals_audit_acquisition_insert on acquisition_funnel_events for insert to clawdeals_app with check(event_name='d7_retained');
      create policy clawdeals_view_app_read on acquisition_funnel_events for select to clawdeals_app using(true);`);
    const analytics=fs.readFileSync(new URL('./neon-acquisition-role-plan.sql',import.meta.url),'utf8');
    check('psql',[...args,'-f','-'],analytics.replace('ROLLBACK; -- Review candidate: actual dump parity and assembled authorization are not approved.','COMMIT;'));
    const insert="insert into acquisition_funnel_events(acquisition_id,event_name,cta_location,interaction_type) values('00000000-0000-4000-8000-000000000001','connect_cta_clicked','hero','primary_click') on conflict(acquisition_id,event_name) do nothing returning *";
    query(asApp(insert)); query(asApp(insert));
    assert.equal(query(asApp("with filtered as (select t.* from acquisition_funnel_events t where event_name='connect_cta_clicked') select cta_location||':'||interaction_type from filtered")).split('\n').at(-1),'hero:primary_click');
    assert.equal(query('select count(*) from acquisition_funnel_events'),'1');
    deny(asApp("update acquisition_funnel_events set cta_location='navbar'")); deny(asApp('delete from acquisition_funnel_events'));
    const invalid=run('psql',[...args,'-c',asApp("insert into acquisition_funnel_events(event_name) values('unreviewed_event')")]);
    assert.notEqual(invalid.status,0); assert.match(invalid.stderr,/row-level security/);

  }finally{if(started)check('pg_ctl',['-D',data,'-m','fast','-w','stop']);fs.rmSync(root,{recursive:true,force:true});}
});

test("acquisition event policy matches the finite shared event constant",()=>{
  const source=fs.readFileSync(new URL('../../src/shared/acquisition.ts',import.meta.url),'utf8');
  const block=source.match(/ACQUISITION_EVENT_NAMES = \[([\s\S]*?)\] as const/); assert(block);
  const names=[...block[1].matchAll(/"([^"\n]+)"/g)].map(m=>m[1]).sort();
  const sql=fs.readFileSync(new URL('./neon-acquisition-role-plan.sql',import.meta.url),'utf8');
  const policy=sql.match(/WITH CHECK \(event_name IN \(([\s\S]*?)\)\)/); assert(policy);
  assert.deepEqual([...policy[1].matchAll(/'([^']+)'/g)].map(m=>m[1]).sort(),names);
  assert(!/GRANT[^;]*(UPDATE|DELETE)/.test(sql)); assert(sql.includes('ROLLBACK;'));
});
