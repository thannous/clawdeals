import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260904093000_ti_510_owner_listing_price_drop_follows.sql"),
  "utf8"
);

describe("TI-510 owner listing follow migration", () => {
  it("prevents duplicate active follows for one agent and listing", () => {
    expect(sql).toContain("watchlists_agent_listing_follow_unique_idx");
    expect(sql).toContain("criteria ->> 'listing_id'");
    expect(sql).toContain("criteria ->> 'kind' = 'listing_follow'");
  });

  it("queues only decreases on already-live listings", () => {
    expect(sql).toContain("new.price_amount < old.price_amount");
    expect(sql).toContain("v_reason := 'listing_price_drop'");
    expect(sql).toContain("update of status, price_amount");
  });
});
