import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const sqlFile = (name: string) => readFileSync(new URL(`../../../${name}`, import.meta.url), "utf8");
describe("Neon queue overlay with source notification functions and restricted roles", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create role clawdeals_app nologin nosuperuser nobypassrls noinherit;
      create role clawdeals_functions nologin nosuperuser nobypassrls noinherit;
      create schema private; revoke all on schema private from public;
      create table private.queue_dispatch_state(queue_name text primary key,last_wake_at timestamptz not null default '-infinity',last_request_id bigint,lease_token uuid,lease_until timestamptz not null default '-infinity');
      create table watchlist_match_queue(id int); create table watchlist_backfill_queue(id int); create table trustscore_recalc_queue(id int);
      create table notification_preferences(owner_id uuid,mode text,event_types jsonb,quiet_enabled boolean,quiet_start_min int,quiet_end_min int,timezone text);
      create table notification_outbox(notification_outbox_id uuid,owner_id uuid,status text,event_type text,attempt_count int,occurred_at timestamptz);
    `);
    // Actual checked-in helper definitions, not lost live catalog metadata.
    const queueMigration = sqlFile("supabase/migrations/20260928210921_queue_event_dispatch.sql");
    const functions = queueMigration.match(/create or replace function [\s\S]*?\$\$;/gi) || [];
    for (const statement of functions) await db.exec(statement);
    await db.exec(sqlFile("supabase/migrations/20260928220905_notification_eligibility_schedule.sql"));
    await db.exec(sqlFile("scripts/migration/neon-queue-runtime.sql").replace("ROLLBACK; -- Review template: actual dump binding and target authorization required.", "COMMIT;"));
    for (const table of ["watchlist_match_queue", "watchlist_backfill_queue", "trustscore_recalc_queue", "notification_outbox", "notification_preferences"]) {
      await db.exec(`alter table public.${table} enable row level security; alter table public.${table} force row level security;`);
    }
    // Explicit opt-in only for this disposable local fixture, not a remote apply.
    await db.exec(sqlFile("scripts/migration/neon-queue-role-plan.sql").replace("ROLLBACK; -- Review template: full imported privilege closure is not yet verified.", "COMMIT;"));
  }, 30000);
  afterAll(async () => { await db?.close(); });
  it("coalesces queue claims without deleting durable work", async () => {
    await db.exec("insert into watchlist_match_queue values(1); set role clawdeals_app");
    try {
      expect((await db.query("select public.claim_neon_queue_wakes_v1() as queues")).rows).toEqual([{ queues: ["watchlist-match-queue"] }]);
      expect((await db.query("select public.claim_neon_queue_wakes_v1() as queues")).rows).toEqual([{ queues: [] }]);
    } finally { await db.exec("reset role"); }
    expect((await db.query("select count(*)::int as n from watchlist_match_queue")).rows).toEqual([{ n: 1 }]);
  });
  it("allows public lease wrappers while denying runtime access to private state/helpers", async () => {
    await db.exec("set role clawdeals_app");
    try {
      await expect(db.query("select * from private.queue_dispatch_state")).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("select private.queue_drain_claim_v1('notifications-dispatch','00000000-0000-4000-8000-000000000001')")).rejects.toMatchObject({ code: "42501" });
      expect((await db.query("select public.queue_drain_claim_v1('notifications-dispatch','00000000-0000-4000-8000-000000000001') as claimed")).rows).toEqual([{ claimed: true }]);
      expect((await db.query("select public.queue_drain_claim_v1('notifications-dispatch','00000000-0000-4000-8000-000000000002') as claimed")).rows).toEqual([{ claimed: false }]);
      await db.query("select public.queue_drain_release_v1('notifications-dispatch','00000000-0000-4000-8000-000000000001')");
    } finally { await db.exec("reset role"); }
  });
  it("executes notification scheduling, rescheduling and reconciliation under the nonowner definer", async () => {
    await db.exec(`insert into notification_preferences(owner_id,mode,event_types,quiet_enabled,quiet_start_min,quiet_end_min,timezone)
      values('00000000-0000-4000-8000-000000000010','INSTANT','["watchlist_match"]',true,0,0,'UTC');
      insert into notification_outbox(notification_outbox_id,owner_id,status,event_type,attempt_count,occurred_at)
      values('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000010','PENDING','watchlist_match',0,now())`);
    expect((await db.query("select available_at='infinity'::timestamptz as quiet from notification_outbox")).rows).toEqual([{ quiet: true }]);
    await db.exec("update notification_preferences set quiet_enabled=false");
    expect((await db.query("select available_at<=now() as due from notification_outbox")).rows).toEqual([{ due: true }]);
    await db.exec("update notification_outbox set attempt_count=1");
    expect((await db.query("select available_at>now()+interval '14 minutes' as backoff from notification_outbox")).rows).toEqual([{ backoff: true }]);
    // A stale snapshot bypassing the preference trigger represents a concurrent
    // insert/change missed by eager rescheduling. Public discovery must repair it.
    await db.exec("update notification_outbox set schedule_preferences='{}',available_at='infinity'; set role clawdeals_app");
    try { await db.query("select public.claim_neon_queue_wakes_v1()"); }
    finally { await db.exec("reset role"); }
    expect((await db.query("select schedule_preferences->>'mode' as mode,available_at<=now() as due from notification_outbox")).rows).toEqual([{ mode: "INSTANT", due: true }]);
    await db.exec("set role clawdeals_functions");
    try {
      await expect(db.exec("update notification_outbox set status='SENT'")).rejects.toMatchObject({ code: "42501" });
      await expect(db.exec("delete from notification_outbox")).rejects.toMatchObject({ code: "42501" });
    } finally { await db.exec("reset role"); }
  });
  it("does not expose retained administrative helpers or arbitrary queue names", async () => {
    await db.exec("set role clawdeals_app");
    try {
      await expect(db.exec("select private.retry_pending_queue_wakes_v1()")).rejects.toMatchObject({ code: "42501" });
      await expect(db.exec("select private.configure_queue_dispatch_v1('not-a-secret')")).rejects.toMatchObject({ code: "42501" });
      await expect(db.exec("select public.queue_drain_claim_v1('unapproved-queue','00000000-0000-4000-8000-000000000001')")).rejects.toMatchObject({ code: "42501" });
    } finally { await db.exec("reset role"); }
  });
  it("retains FORCE RLS and nonowner/nonbypass function/runtime roles", async () => {
    expect((await db.query("select relforcerowsecurity as forced from pg_class where oid='private.queue_dispatch_state'::regclass")).rows).toEqual([{ forced: true }]);
    expect((await db.query("select bool_or(rolsuper or rolbypassrls or rolcanlogin) as elevated from pg_roles where rolname in ('clawdeals_app','clawdeals_functions')")).rows).toEqual([{ elevated: false }]);
    expect((await db.query("select pg_has_role('clawdeals_app','clawdeals_functions','MEMBER') as member")).rows).toEqual([{ member: false }]);
  });
});
