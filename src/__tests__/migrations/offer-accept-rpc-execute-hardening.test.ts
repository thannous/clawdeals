import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260827093000_offer_accept_rpc_execute_hardening.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("offer accept RPC execute hardening migration", () => {
  it("restricts the public wrapper to the service role", () => {
    expect(sql).toMatch(
      /revoke all on function public\.offer_accept_v0\(uuid, uuid\)\s+from public, anon, authenticated/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.offer_accept_v0\(uuid, uuid\)\s+to service_role/i
    );
  });
});
