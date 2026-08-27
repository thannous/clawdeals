import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260827090000_public_api_rls_hardening.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("public API RLS hardening migration", () => {
  it("keeps OAuth user-code attempt state behind service-role access", () => {
    expect(sql).toMatch(
      /alter table public\.oauth_device_user_code_attempts enable row level security/i
    );
    expect(sql).toMatch(
      /revoke all on table public\.oauth_device_user_code_attempts\s+from anon, authenticated/i
    );
  });

  it("does not expose the watchlist queue worker as a Data API RPC", () => {
    expect(sql).toMatch(
      /revoke execute on function public\.enqueue_watchlist_match_queue_v1\(\)\s+from public, anon, authenticated/i
    );
  });
});
