import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Browser fixtures cannot prove database grants, RPC atomicity or attachment
// ownership. Execute the actual migration with PostgreSQL; only its pre-existing
// listings/owners dependencies are reduced fixtures, not an emulated SQL engine.
const migration = readFileSync(new URL("../../../supabase/migrations/20261022150537_smartphone_passports_v1.sql", import.meta.url), "utf8");
const seller = "10000000-0000-4000-8000-000000000001";
const otherSeller = "10000000-0000-4000-8000-000000000002";
const listing = "20000000-0000-4000-8000-000000000001";
const otherListing = "20000000-0000-4000-8000-000000000002";
const ids = ["battery", "screen", "functionality", "locks", "repairs_accessories"];
const checks = () => Object.fromEntries(ids.map((id) => [id, { answer: "unknown", notes: "", photo_ids: [] as string[] }]));

describe("smartphone passport migration on PostgreSQL", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.owners (owner_id uuid primary key);
      create table public.listings (listing_id uuid primary key, owner_id uuid references public.owners, status text not null default 'LIVE');
      grant select, update on public.listings to service_role;
      grant select on public.owners to service_role;
    `);
    await db.exec(migration);
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("reset role; truncate public.listings, public.owners cascade;");
    await db.query("insert into public.owners values ($1), ($2)", [seller, otherSeller]);
    await db.query("insert into public.listings(listing_id,owner_id) values ($1,$2),($3,$4)", [listing, seller, otherListing, otherSeller]);
    await db.exec("set role service_role");
  });
  const save = (revision = 0, values = checks(), owner = seller) => db.query<{ revision: number; model: string }>(
    "select * from public.save_smartphone_passport_v1($1,$2,$3,$4,$5,$6::jsonb)",
    [listing, owner, revision, "Synthetic smartphone", 89, JSON.stringify(values)]
  );
  const reserve = (photoId: string, checkId = "battery", targetListing = listing, owner = seller) => db.query(
    "select * from public.reserve_smartphone_passport_photo_v1($1,$2,$3,$4,$5,$6,$7)",
    [targetListing, owner, photoId, checkId, "evidence", `smartphone-passports/${targetListing}/${photoId}.jpg`, 100]
  );
  const finish = (photoId: string, targetListing = listing, owner = seller) => db.query(
    "select * from public.finish_smartphone_passport_photo_v1($1,$2,$3)", [targetListing, owner, photoId]
  );
  const claimDelete = (photoId: string) => db.query(
    "select * from public.claim_smartphone_passport_photo_deletion_v1($1,$2,$3)", [listing, seller, photoId]
  );

  it("persists declarations and rejects stale writes without overwriting saved data", async () => {
    expect((await save()).rows[0]).toMatchObject({ revision: 1, model: "Synthetic smartphone" });
    const newer = checks(); newer.screen.notes = "Small scratch";
    expect((await save(1, newer)).rows[0].revision).toBe(2);
    await expect(save(1)).rejects.toThrow("PASSPORT_REVISION_CONFLICT");
    expect((await db.query<{ checks: ReturnType<typeof checks> }>("select checks from public.smartphone_passports")).rows[0].checks.screen.notes).toBe("Small scratch");
  });

  it.each(["RESERVED", "CONTACT_REVEALED", "COMPLETED", "REMOVED", "EXPIRED"])("freezes evidence once the listing is %s", async (status) => {
    await save();
    const photo = randomUUID(); await reserve(photo);
    await db.query("update public.listings set status=$1 where listing_id=$2", [status, listing]);
    await expect(save(1)).rejects.toThrow("PASSPORT_LOCKED");
    await expect(reserve(randomUUID())).rejects.toThrow("PASSPORT_LOCKED");
    await expect(finish(photo)).rejects.toThrow("PASSPORT_LOCKED");
    expect((await db.query<{ revision: number }>("select revision from public.smartphone_passports")).rows[0].revision).toBe(1);
  });

  it("rejects an owner trying to save or upload against another owner's listing", async () => {
    await expect(save(0, checks(), otherSeller)).rejects.toThrow("PASSPORT_NOT_FOUND");
    await expect(reserve(randomUUID(), "battery", listing, otherSeller)).rejects.toThrow("PASSPORT_NOT_FOUND");
    expect((await db.query("select * from public.smartphone_passports")).rows).toEqual([]);
  });

  it.each(["anon", "authenticated"])("denies %s direct rows and every privileged RPC", async (role) => {
    await save();
    await db.exec(`set role ${role}`);
    await expect(db.query("select * from public.smartphone_passports")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.smartphone_passport_photos")).rejects.toThrow(/permission denied/);
    await expect(save()).rejects.toThrow(/permission denied/);
    await expect(reserve(randomUUID())).rejects.toThrow(/permission denied/);
    await expect(finish(randomUUID())).rejects.toThrow(/permission denied/);
    await expect(claimDelete(randomUUID())).rejects.toThrow(/permission denied/);
  });

  it("retains RLS protection even if a client role later receives SELECT", async () => {
    await save();
    await db.exec("reset role; grant select on public.smartphone_passports, public.smartphone_passport_photos to authenticated; set role authenticated;");
    try {
      expect((await db.query("select * from public.smartphone_passports")).rows).toEqual([]);
      expect((await db.query("select * from public.smartphone_passport_photos")).rows).toEqual([]);
    } finally {
      await db.exec("reset role; revoke select on public.smartphone_passports, public.smartphone_passport_photos from authenticated;");
    }
  });

  it("refuses fabricated verification status and invalid battery values at the SQL boundary", async () => {
    const forged = checks(); Object.assign(forged.battery, { verified: true });
    await expect(save(0, forged)).rejects.toThrow("PASSPORT_INVALID");
    await expect(db.query("select * from public.save_smartphone_passport_v1($1,$2,0,'Phone',101,$3::jsonb)", [listing, seller, JSON.stringify(checks())])).rejects.toThrow("PASSPORT_INVALID");
    const invalid = checks(); invalid.locks.answer = "not_applicable"; invalid.locks.notes = "Skip";
    await expect(save(0, invalid)).rejects.toThrow("PASSPORT_INVALID");
  });

  it("cannot attach unconfirmed uploads, another listing's photo or a different check's photo", async () => {
    const photo = randomUUID(); await reserve(photo);
    const draft = checks(); draft.battery.photo_ids = [photo];
    await expect(save(0, draft)).rejects.toThrow("PASSPORT_PHOTO_INVALID");
    await finish(photo);
    const wrongCheck = checks(); wrongCheck.screen.photo_ids = [photo];
    await expect(save(0, wrongCheck)).rejects.toThrow("PASSPORT_PHOTO_INVALID");
    const foreign = randomUUID(); await reserve(foreign, "battery", otherListing, otherSeller); await finish(foreign, otherListing, otherSeller);
    draft.battery.photo_ids = [foreign];
    await expect(save(0, draft)).rejects.toThrow("PASSPORT_PHOTO_INVALID");
    draft.battery.photo_ids = [photo]; draft.battery.answer = "ok";
    await save(0, draft);
    expect((await db.query<{ attached: boolean }>("select attached from public.smartphone_passport_photos where photo_id=$1", [photo])).rows[0].attached).toBe(true);
  });

  it("protects attached evidence from deletion and rejects attachments already claimed for deletion", async () => {
    const photo = randomUUID(); await reserve(photo); await finish(photo);
    const draft = checks(); draft.screen.notes = "Screen intact"; draft.battery.photo_ids = [photo];
    await save(0, draft);
    await expect(claimDelete(photo)).rejects.toThrow("PASSPORT_PHOTO_IN_USE");
    await save(1);
    await claimDelete(photo);
    await expect(save(2, draft)).rejects.toThrow("PASSPORT_PHOTO_INVALID");
  });

  it("bounds orphan uploads and requires listing-scoped server-generated storage paths", async () => {
    await expect(db.query("select * from public.reserve_smartphone_passport_photo_v1($1,$2,$3,'battery','evidence','arbitrary-key',100)", [listing, seller, randomUUID()])).rejects.toThrow("PASSPORT_PHOTO_INVALID");
    for (let i = 0; i < 15; i++) await reserve(randomUUID());
    await expect(reserve(randomUUID())).rejects.toThrow("PASSPORT_PHOTO_LIMIT");
    expect((await db.query<{ count: number }>("select count(*)::int as count from public.smartphone_passport_photos")).rows[0].count).toBe(15);
  });
});
