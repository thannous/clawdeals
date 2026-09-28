// Browser tests cannot advance DST or interleave database preferences/queue writes.
// Disposable PostgreSQL covers calendar parity, retry backoff, stale preference
// snapshots, due-only wakes, permission denial and transaction rollback.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.CLAWDEALS_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema private; create schema vault; create schema net; create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as 'select 1::bigint';
create table vault.secrets(id uuid,name text); create table vault.decrypted_secrets(name text,decrypted_secret text);
create function vault.create_secret(text,text,text) returns uuid language sql as 'select null::uuid';
create function vault.update_secret(uuid,text) returns void language sql as 'select';
create table net.requests(id bigserial,url text,body jsonb,headers jsonb);
create function net.http_post(url text,body jsonb default '{}',headers jsonb default '{}',timeout_milliseconds int default 5000) returns bigint language sql as $$insert into net.requests(url,body,headers) values(url,body,headers) returning id$$;
create table public.watchlist_match_queue(id int,attempt_count int default 0);
create table public.watchlist_backfill_queue(id int); create table public.trustscore_recalc_queue(id int);
create table public.notification_preferences(owner_id uuid primary key,mode text default 'DIGEST_HOURLY',timezone text default 'UTC',quiet_enabled boolean default false,quiet_start_min int,quiet_end_min int,daily_digest_hour int default 9,last_hourly_digest_at timestamptz,last_daily_digest_at timestamptz,event_types text[] default '{watchlist_match}',updated_at timestamptz default now());
create table public.notification_outbox(notification_outbox_id uuid default gen_random_uuid() primary key,owner_id uuid,event_type text default 'watchlist_match',status text default 'PENDING',attempt_count int default 0,occurred_at timestamptz default now());`);
await db.exec(readFileSync(new URL('../supabase/migrations/20260928210921_queue_event_dispatch.sql',import.meta.url),'utf8').replace(/create extension if not exists pg_(net|cron);\n/gi,''));
const migration=process.env.CLAWDEALS_SCHEDULE_MIGRATION || '20260928220905_notification_eligibility_schedule.sql';
await db.exec(readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
const scalar=async(q,args=[])=>(await db.query(q,args)).rows[0].n;
const cases=[
 ['realtime',{mode:'REALTIME'},'2026-09-28T10:15:12Z','2026-09-28T10:15:12Z'],
 ['hourly',{mode:'DIGEST_HOURLY',last_hourly_digest_at:'2026-09-28T10:05Z'},'2026-09-28T10:15Z','2026-09-28T11:00Z'],
 ['daily',{mode:'DIGEST_DAILY',daily_digest_hour:9},'2026-09-28T08:00Z','2026-09-28T09:00Z'],
 ['daily already sent',{mode:'DIGEST_DAILY',daily_digest_hour:9,last_daily_digest_at:'2026-09-28T09:00Z'},'2026-09-28T10:00Z','2026-09-29T09:00Z'],
 ['quiet wrap',{mode:'REALTIME',quiet_enabled:true,quiet_start_min:1320,quiet_end_min:360},'2026-09-28T23:00Z','2026-09-29T06:00Z'],
 ['lowercase timezone',{mode:'DIGEST_DAILY',timezone:'europe/paris',daily_digest_hour:9},'2026-09-28T06:00Z','2026-09-28T07:00Z'],
 ['offset timezone',{mode:'DIGEST_DAILY',timezone:'+01:00',daily_digest_hour:9},'2026-09-28T06:00Z','2026-09-28T08:00Z'],
 ['negative offset',{mode:'DIGEST_DAILY',timezone:'-0130',daily_digest_hour:9},'2026-09-28T08:00Z','2026-09-28T10:30Z'],
 ['DST gap',{mode:'REALTIME',timezone:'Europe/Paris',quiet_enabled:true,quiet_start_min:0,quiet_end_min:150},'2026-03-29T00:00Z','2026-03-29T01:00Z'],
 ['DST repeated hour',{mode:'DIGEST_HOURLY',timezone:'Europe/Paris',last_hourly_digest_at:'2026-10-25T00:15Z'},'2026-10-25T00:30Z','2026-10-25T02:00Z'],
 ['silent suppression',{mode:'SILENT',quiet_enabled:true,quiet_start_min:0,quiet_end_min:0},'2026-09-28T10:00Z','2026-09-28T10:00Z'],
 ['null quiet bound',{mode:'REALTIME',quiet_enabled:true,quiet_start_min:0},'2026-09-28T10:00Z','2026-09-28T10:00Z'],
 ['invalid timezone',{mode:'REALTIME',timezone:'invalid'},'2026-09-28T10:00Z','2026-09-28T10:00Z'],
];
for(const [label,prefs,now,expected] of cases){const value=await scalar('select private.notification_eligible_at_v1($1::jsonb,$2::timestamptz) n',[JSON.stringify(prefs),now]);assert.equal(new Date(value).toISOString(),new Date(expected).toISOString(),label);}
for(const prefs of [{mode:'REALTIME',quiet_enabled:true,quiet_start_min:0,quiet_end_min:0},{mode:'DIGEST_DAILY',daily_digest_hour:23,quiet_enabled:true,quiet_start_min:1320,quiet_end_min:360}])assert.equal(await scalar("select private.notification_eligible_at_v1($1::jsonb,'2026-09-28T10:00Z')::text n",[JSON.stringify(prefs)]),'infinity');
const owner='00000000-0000-0000-0000-000000000001';
await db.exec(`insert into vault.decrypted_secrets values('clawdeals_queue_dispatch_secret','fixture-secret-only'); insert into notification_preferences(owner_id,mode,quiet_enabled,quiet_start_min,quiet_end_min) values('${owner}','REALTIME',true,0,0); insert into notification_outbox(owner_id) values('${owner}');`);
assert.equal(await scalar('select count(*)::int n from net.requests'),0);
await db.exec('select private.retry_pending_queue_wakes_v1()');assert.equal(await scalar('select count(*)::int n from net.requests'),0);
await db.exec(`update notification_preferences set quiet_enabled=false where owner_id='${owner}'`);
assert.equal(await scalar('select count(*)::int n from net.requests'),1);
await db.exec("update private.queue_dispatch_state set last_wake_at='-infinity'; update notification_outbox set attempt_count=attempt_count+1");
assert.equal(await scalar('select bool_and(available_at > now()) n from notification_outbox'),true);
await db.exec('select private.retry_pending_queue_wakes_v1()');assert.equal(await scalar('select count(*)::int n from net.requests'),1);
// Simulate the observable outcome of an insertion that read an old preference
// snapshot while its concurrent update could not yet see that inserted row.
await db.exec("update notification_outbox set available_at='infinity', schedule_preferences='{}'; select private.retry_pending_queue_wakes_v1()");
assert.equal(await scalar('select bool_and(available_at <= now()) n from notification_outbox'),true);
assert.equal(await scalar('select count(*)::int n from net.requests'),2);
await db.exec(`update notification_preferences set mode='DIGEST_HOURLY',last_hourly_digest_at=now() where owner_id='${owner}'`);
assert.equal(await scalar('select bool_and(available_at > now()) n from notification_outbox'),true);
await db.exec('delete from notification_preferences');
assert.equal(await scalar('select bool_and(available_at <= now()) n from notification_outbox'),true);
await db.exec(`insert into notification_preferences(owner_id,last_hourly_digest_at) values('${owner}',now())`);
assert.equal(await scalar('select bool_and(available_at > now()) n from notification_outbox'),true);
await db.exec("update notification_preferences set mode='REALTIME',event_types='{}'; update private.queue_dispatch_state set last_wake_at='-infinity'");
assert.equal(await scalar("select bool_and(available_at='infinity'::timestamptz) n from notification_outbox"),true);
const count=await scalar('select count(*)::int n from net.requests');await db.exec('select private.retry_pending_queue_wakes_v1()');assert.equal(await scalar('select count(*)::int n from net.requests'),count);
await db.exec("update notification_preferences set event_types='{watchlist_match}'");assert.equal(await scalar('select count(*)::int n from net.requests'),count+1);
await db.exec("update notification_preferences set mode='DIGEST_HOURLY',last_hourly_digest_at=now()");
await db.exec('set role anon');await assert.rejects(db.query("select private.notification_eligible_at_v1('{}',now())"),/permission denied/);await db.exec('reset role');
await db.exec('begin; update notification_preferences set mode=\'REALTIME\'; rollback;');
assert.equal(await scalar('select bool_and(available_at > now()) n from notification_outbox'),true);
const result={passed:true,calendarCases:cases.length+2,checks:['future rows do not wake','preference update wakes due rows','attempt backoff','stale preference snapshot reconciliation','digest update reschedules remainder','preference delete and insert','disabled events and reenable','anonymous denial','rollback'],target:'disposable PGlite with simulated pg_net transport'};
writeFileSync(process.env.CLAWDEALS_SCHEDULE_REPORT||'/tmp/claw-notification-schedule-results.json',JSON.stringify(result,null,2));console.log(result);await db.close();
