import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260826170000_ti_377_offer_accept_lock_order.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("TI-377 offer accept lock order migration", () => {
  it("preserves the current implementation behind a private service-role helper", () => {
    expect(sql).toMatch(
      /alter function public\.offer_accept_v0\(uuid, uuid\)\s+rename to offer_accept_locked_impl_v0/i
    );
    expect(sql).toMatch(
      /revoke execute on function public\.offer_accept_locked_impl_v0\(uuid, uuid\)\s+from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.offer_accept_locked_impl_v0\(uuid, uuid\)\s+to service_role/i
    );
  });

  it("locks the shared listing before delegating to the offer-locking implementation", () => {
    const discoverIndex = sql.indexOf("select o.listing_id");
    const listingLockIndex = sql.indexOf("from public.listings l");
    const forUpdateIndex = sql.indexOf("for update", listingLockIndex);
    const delegateIndex = sql.indexOf("from public.offer_accept_locked_impl_v0");

    expect(discoverIndex).toBeGreaterThanOrEqual(0);
    expect(listingLockIndex).toBeGreaterThan(discoverIndex);
    expect(forUpdateIndex).toBeGreaterThan(listingLockIndex);
    expect(delegateIndex).toBeGreaterThan(forUpdateIndex);
    expect(sql.slice(discoverIndex, listingLockIndex)).not.toContain("for update");
  });

  it("keeps the public RPC signature and result contract stable", () => {
    expect(sql).toContain("create function public.offer_accept_v0(");
    expect(sql).toContain("offer_status public.offer_status");
    expect(sql).toContain("listing_status public.listing_status");
    expect(sql).toContain("tx_status public.transaction_status");
    expect(sql).toContain("contact_reveal_state public.contact_reveal_state");
    expect(sql).toContain("set search_path = pg_catalog, public");
  });
});
