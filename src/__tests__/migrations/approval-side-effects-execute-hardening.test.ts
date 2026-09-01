import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260901125534_approval_side_effects_execute_hardening.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("approval side-effects execute hardening migration", () => {
  it("keeps the trigger function private to the service role", () => {
    expect(sql).toMatch(
      /revoke all on function public\.approvals_apply_side_effects_v1\(\)\s+from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.approvals_apply_side_effects_v1\(\)\s+to service_role/i
    );
  });

  it("does not replace the function or its trigger", () => {
    expect(sql).not.toMatch(/create or replace function/i);
    expect(sql).not.toMatch(/drop trigger/i);
  });
});
