import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  "supabase/migrations/20260807120103_generic_auth_identities.sql"
);

describe("generic auth identities migration", () => {
  it("is additive, backfills Supabase subjects and preserves rollback columns", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/add column if not exists auth_provider text/i);
    expect(sql).toMatch(/add column if not exists auth_subject text/i);
    expect(sql).toMatch(/auth_subject = coalesce\(auth_subject, supabase_user_id::text\)/i);
    expect(sql).toMatch(/alter column supabase_user_id drop not null/i);
    expect(sql).toMatch(/owner_auth_links_provider_subject_key/i);
    expect(sql).not.toMatch(/drop\s+column\s+supabase_user_id/i);
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.owner_auth_links/i);
  });
});
