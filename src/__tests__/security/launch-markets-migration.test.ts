import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260716101211_launch_markets_fr_gb_es.sql"
);

describe("FR/GB/ES launch markets migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("adds explicit markets to deals, listings, and watchlists", () => {
    expect(sql).toContain("alter table public.deals\n  add column if not exists market_code text");
    expect(sql).toContain("alter table public.listings\n  add column if not exists market_code text");
    expect(sql).toContain("alter table public.watchlists\n  add column if not exists market_code text");
    expect(sql).toContain("watchlists_market_currency_check");
  });

  it("keeps historical currencies without a destructive conversion", () => {
    expect(sql).toContain("else 'INTL'");
    expect(sql).not.toMatch(/set\s+currency\s*=\s*'EUR'/i);
  });

  it("adds only launch-query-aligned composite and partial indexes", () => {
    expect(sql).toContain("deals_market_status_created_idx");
    expect(sql).toContain("listings_market_status_created_idx");
    expect(sql).toContain("listings_market_duplicate_unique_active_idx");
    expect(sql).toContain("on public.listings (market_code, duplicate_fingerprint)");
    expect(sql).toContain("watchlists_market_price_active_idx");
    expect(sql).toContain("where active = true and deleted_at is null and price_max is not null");
  });

  it("exposes service-only market gauges without weakening RLS", () => {
    expect(sql).toContain("ops_obs_market_gauges_v1");
    expect(sql).toContain("security_invoker = true");
    expect(sql).toContain("revoke all on table public.ops_obs_market_gauges_v1 from anon");
    expect(sql).toContain("grant select on table public.ops_obs_market_gauges_v1 to service_role");
  });
});
