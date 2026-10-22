import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Real PostgreSQL privileges and compare-and-set transitions complement the live
// browser flow: delayed workers and direct role grants are not browser fixtures.
const migration = readFileSync(new URL("../../../supabase/migrations/20261022192326_smartphone_passport_missions_v1.sql", import.meta.url), "utf8");
const L = "20000000-0000-4000-8000-000000000001";
const W = "30000000-0000-4000-8000-000000000001";
const A = "40000000-0000-4000-8000-000000000001";
const criteria = () => ({ mission: { kind: "BUY", expires_at: new Date(Date.now() + 86400000).toISOString(), smartphone: { version: 1, model: null, battery_health_min: 90, required_checks: [] } }, notification_mode: "in_app" });

describe("smartphone mission transitions on PostgreSQL", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table agents(id uuid primary key, suspended_at timestamptz);
      create table listings(listing_id uuid primary key, status text default 'LIVE', title text default 'Phone', description text, category text, condition text, price_amount integer default 400, currency text default 'EUR', market_code text default 'FR', geo_lat double precision, geo_lng double precision, delivery_method text, created_at timestamptz default now());
      create table watchlists(watchlist_id uuid primary key, agent_id uuid references agents, criteria jsonb not null, updated_at timestamptz default now(), active boolean default true, deleted_at timestamptz);
      create table smartphone_passports(listing_id uuid primary key references listings on delete cascade, revision integer, model text, battery_health_percent integer, checks jsonb);
      create table moderation_states(entity_type text, entity_id uuid, hidden boolean, primary key(entity_type,entity_id));
      create table watchlist_matches(watchlist_match_id uuid primary key default gen_random_uuid(),watchlist_id uuid references watchlists on delete cascade,agent_id uuid,entity_type text,entity_id uuid,matched_at timestamptz,reason jsonb,delivered_at timestamptz, unique(watchlist_id,entity_type,entity_id));
      create table watchlist_match_queue(entity_type text,entity_id uuid,last_reason text,attempt_count integer default 0,last_error text,updated_at timestamptz default now(),primary key(entity_type,entity_id));
      create table watchlist_backfill_queue(watchlist_id uuid primary key,updated_at timestamptz);
      grant select,insert,update,delete on all tables in schema public to service_role;
    `);
    await db.exec(migration);
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("reset role; truncate listings,agents,watchlists,moderation_states,watchlist_match_queue,watchlist_backfill_queue cascade");
    await db.query("insert into agents(id) values($1)", [A]);
    await db.query("insert into listings(listing_id) values($1)", [L]);
    await db.query("insert into watchlists(watchlist_id,agent_id,criteria) values($1,$2,$3)", [W,A,criteria()]);
    await db.exec("set role service_role");
  });
  async function snapshot() {
    const listing = (await db.query<any>("select to_jsonb(l) as value from listings l where listing_id=$1", [L])).rows[0].value;
    const watchlist = (await db.query<any>("select to_jsonb(w) as value from watchlists w where watchlist_id=$1", [W])).rows[0].value;
    const passport = (await db.query<any>("select revision from smartphone_passports where listing_id=$1", [L])).rows[0];
    return { listing, watchlist, revision: passport?.revision || 0 };
  }
  async function record(compatible = true, saved?: Awaited<ReturnType<typeof snapshot>>) {
    const s = saved || await snapshot();
    return (await db.query<any>("select record_smartphone_mission_match_v1($1,$2,$3,$4,$5,$6,$7,$8) as value", [W,L,s.listing,s.watchlist.updated_at,s.watchlist.criteria,s.revision,compatible,{ smartphone: { status: compatible ? "compatible" : "unknown", reasons: [{ code: compatible ? "battery_meets_minimum" : "battery_unknown" }] } }])).rows[0].value;
  }
  it("emits one first match and suppresses retries and still-compatible passport edits", async () => {
    expect((await record()).alert.reason.change).toBe("first_match");
    expect((await record()).alert).toBeNull();
    await db.query("insert into smartphone_passports(listing_id,revision) values($1,1)", [L]);
    expect((await record()).alert).toBeNull();
    expect((await db.query("select * from watchlist_matches")).rows).toHaveLength(1);
  });
  it("records only an observed incompatible-to-compatible price transition with its real baseline", async () => {
    await db.query("update listings set price_amount=500 where listing_id=$1", [L]);
    expect((await record(false)).alert).toBeNull();
    await db.query("update listings set price_amount=400 where listing_id=$1", [L]);
    expect((await record()).alert.reason).toMatchObject({ change: "price_changed", previous_price: 500, current_price: 400 });
    expect((await record()).alert).toBeNull();
  });
  it("reports a newly supplied passport without inventing a previous battery value", async () => {
    await record(false);
    await db.query("insert into smartphone_passports(listing_id,revision) values($1,1)", [L]);
    const result = await record();
    expect(result.alert.reason).toMatchObject({ change: "passport_updated", passport_revision: 1 });
    expect(result.alert.reason).not.toHaveProperty("previous_battery");
  });
  it.each(["price", "passport", "criteria"])("rejects a delayed worker after %s changes", async change => {
    const stale = await snapshot();
    if (change === "price") await db.query("update listings set price_amount=450 where listing_id=$1", [L]);
    if (change === "passport") await db.query("insert into smartphone_passports(listing_id,revision) values($1,1)", [L]);
    if (change === "criteria") await db.query("update watchlists set criteria=jsonb_set(criteria,'{mission,smartphone,battery_health_min}','95') where watchlist_id=$1", [W]);
    expect(await record(true, stale)).toEqual({ stale: true });
    expect((await db.query("select * from watchlist_matches")).rows).toEqual([]);
  });
  it.each(["REMOVED", "RESERVED"])("invalidates state immediately on %s before the LIVE-only queue skips it", async status => {
    await record();
    await db.query("update listings set status=$1 where listing_id=$2", [status,L]);
    expect((await db.query<any>("select compatible from smartphone_mission_match_state")).rows[0].compatible).toBe(false);
    expect((await db.query("select * from watchlist_matches")).rows).toEqual([]);
    expect((await record()).alert).toBeNull();
  });
  it("suppresses hidden and paused matches even if the worker computed compatibility beforehand", async () => {
    const saved = await snapshot();
    await db.query("insert into moderation_states values('listing',$1,true)", [L]);
    expect((await record(true,saved)).matched).toBe(false);
    await db.query("delete from moderation_states where entity_id=$1", [L]);
    await record();
    await db.query("update watchlists set active=false where watchlist_id=$1", [W]);
    expect((await db.query("select * from watchlist_matches")).rows).toEqual([]);
    expect((await record()).matched).toBe(false);
  });
  it.each(["expired", "suspended"])("refuses %s missions at the SQL boundary", async state => {
    if (state === "expired") await db.query("update watchlists set criteria=jsonb_set(criteria,'{mission,expires_at}',to_jsonb('2000-01-01T00:00:00Z'::text)) where watchlist_id=$1",[W]);
    else await db.query("update agents set suspended_at=now() where id=$1",[A]);
    expect((await record()).matched).toBe(false);
    expect((await db.query("select * from watchlist_matches")).rows).toEqual([]);
  });
  it("enqueues passport edits transactionally and keeps a newer event when an older worker deletes its snapshot", async () => {
    await db.query("insert into smartphone_passports(listing_id,revision) values($1,1)",[L]);
    // A future token deterministically simulates equal/coarser clock ticks or a
    // clock moving backwards. Read text to retain PostgreSQL microseconds.
    await db.query("update watchlist_match_queue set updated_at='2100-01-01T00:00:00Z'");
    const old = (await db.query<any>("select updated_at::text as token from watchlist_match_queue")).rows[0].token;
    await db.query("update smartphone_passports set revision=2 where listing_id=$1",[L]);
    await db.query("delete from watchlist_match_queue where entity_id=$1 and updated_at=$2",[L,old]);
    expect((await db.query("select * from watchlist_match_queue")).rows).toHaveLength(1);
  });
  it.each(["anon", "authenticated"])("denies %s table access and transition execution", async role => {
    const saved = await snapshot();
    await db.exec(`set role ${role}`);
    await expect(db.query("select * from smartphone_mission_match_state")).rejects.toThrow(/permission denied/);
    await expect(record(true,saved)).rejects.toThrow(/permission denied/);
  });
});
