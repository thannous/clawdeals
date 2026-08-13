import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260810113000_acquisition_revenue_attribution_v1.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("acquisition revenue attribution migration", () => {
  it("adds the missing session milestone and privacy-protected reporting objects", () => {
    expect(sql).toContain("'activation_started'");
    expect(sql).toContain("activation_started_at");
    expect(sql).toContain("create table if not exists public.acquisition_revenue_attributions");
    expect(sql).toContain("alter table public.acquisition_revenue_attributions force row level security");
    expect(sql).toContain("revoke all on table public.acquisition_revenue_attributions from anon, authenticated");
  });

  it("attributes released revenue to the latest backend activation without generated IDs", () => {
    expect(sql).toContain("activation.event_name = 'agent_connected'");
    expect(sql).toContain("activation.occurred_at <= revenue_occurred_at");
    expect(sql).toContain("platform_revenue_minor");
    expect(sql).not.toMatch(/gen_random_uuid\(\).*acquisition_id/i);
  });
});
