import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Ordered interleavings exercise stale workers and role grants on PostgreSQL.
// Browser drains cannot force these races between an RPC and its checkpoint.
const migration = readFileSync(new URL("../../../supabase/migrations/20261023152827_watchlist_backfill_progress_v1.sql", import.meta.url), "utf8");
const original = readFileSync(new URL("../../../supabase/migrations/20261022192326_smartphone_passport_missions_v1.sql", import.meta.url), "utf8");
const W = "30000000-0000-4000-8000-000000000001";
const W2 = "30000000-0000-4000-8000-000000000002";
const L = "20000000-0000-4000-8000-000000000001";
const START = "2026-10-23T00:00:00.123456Z";
const CURSOR = "2026-10-22T00:00:00.654321Z";

describe("durable backfill checkpoints on PostgreSQL", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema private;
      create table public.listings(listing_id uuid primary key, created_at timestamptz, status text, market_code text);
      create table public.watchlist_backfill_queue(watchlist_id uuid primary key, updated_at timestamptz not null default now());
      create table public.watchlist_match_queue(entity_id uuid, updated_at timestamptz);
      create table public.wakes(id integer generated always as identity);
      create function private.wake_queue_consumer_v1() returns trigger language plpgsql as $$
        begin insert into public.wakes default values; return new; end;
      $$;
      grant select,insert,update,delete on all tables in schema public to service_role;
      grant usage,select on all sequences in schema public to service_role;
    `);
    await db.exec(original.slice(original.indexOf("create function public.advance_watchlist_queue_clock_v1()")));
    await db.exec(migration);
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("reset role; truncate watchlist_backfill_queue,wakes; set role service_role");
    await db.query("insert into watchlist_backfill_queue(watchlist_id,updated_at) values($1,'2100-01-01T00:00:00.123456Z'),($2,'2100-01-01T00:00:00.123457Z')", [W,W2]);
  });
  async function state(id = W) {
    return (await db.query<any>("select *, updated_at::text as generation, available_at::text as available, listing_cursor_created_at::text as cursor from watchlist_backfill_queue where watchlist_id=$1", [id])).rows[0];
  }
  async function checkpoint(previous: any, count: number, complete = false) {
    return (await db.query<any>("select checkpoint_watchlist_backfill_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) as changed", [W,previous.generation,previous.progress_version,START,9,count ? CURSOR : null,count ? L : null,count,complete])).rows[0].changed;
  }
  it("keeps committed progress, timestamp precision, and no checkpoint wake", async () => {
    const queued = await state();
    expect(await checkpoint(queued, 1)).toBe(true);
    const saved = await state();
    expect(saved.generation).toBe(queued.generation);
    expect(saved.cursor).toContain(".654321");
    expect(saved.listings_scanned).toBe(1);
    expect((await db.query("select * from wakes")).rows).toHaveLength(2);
  });
  it("rejects a concurrent worker's old version without regressing or deleting progress", async () => {
    const stale = await state();
    await checkpoint(stale, 1);
    expect(await checkpoint(stale, 0)).toBe(false);
    expect(await checkpoint(stale, 0, true)).toBe(false);
    expect((await state()).listings_scanned).toBe(1);
  });
  it("resets on a same-timestamp enqueue and fences the old generation", async () => {
    await checkpoint(await state(), 1);
    const old = await state();
    await db.query("insert into watchlist_backfill_queue(watchlist_id,updated_at) values($1,$2) on conflict(watchlist_id) do update set updated_at=excluded.updated_at", [W,old.generation]);
    const fresh = await state();
    expect(fresh.generation).not.toBe(old.generation);
    expect(fresh.available).toBe(old.available);
    expect(fresh).toMatchObject({ listings_scanned: 0, progress_version: 0, scan_started_at: null, scan_limit: null, listing_cursor_id: null });
    expect(await checkpoint(old, 2)).toBe(false);
    expect(await checkpoint(old, 1, true)).toBe(false);
    expect((await db.query("select * from wakes")).rows).toHaveLength(3);
  });
  it("schedules an untouched mission before a resumed one, including after reenqueuing it", async () => {
    await db.query("update watchlist_backfill_queue set available_at='2000-01-01' where watchlist_id=$1", [W2]);
    await checkpoint(await state(), 1);
    const old = await state();
    await db.query("update watchlist_backfill_queue set updated_at=updated_at where watchlist_id=$1", [W]);
    expect((await state()).available).toBe(old.available);
    expect((await db.query<any>("select watchlist_id from watchlist_backfill_queue order by available_at,watchlist_id")).rows[0].watchlist_id).toBe(W2);
  });
  it("deletes only the current completed generation", async () => {
    await checkpoint(await state(), 1);
    expect(await checkpoint(await state(), 1, true)).toBe(true);
    expect(await state()).toBeUndefined();
    expect(await state(W2)).toBeDefined();
  });
  it("rejects null bounds and grants the checkpoint only to the service role", async () => {
    await expect(db.query("select checkpoint_watchlist_backfill_v1($1,now(),0,now(),null,null,null,0,false)", [W])).rejects.toThrow("Invalid backfill checkpoint");
    await db.exec("reset role; set role authenticated");
    await expect(db.query("select checkpoint_watchlist_backfill_v1($1,now(),0,now(),9,null,null,0,false)", [W])).rejects.toThrow("permission denied");
  });
});
