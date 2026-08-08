import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runScript(script: string, env: Record<string, string>) {
  return spawnSync(process.execPath, [path.resolve(script)], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
}

describe("migration export guardrails", () => {
  it("shows a plan without requiring credentials", () => {
    const database = runScript("scripts/migration/export-supabase-postgres.mjs", {
      SUPABASE_DB_URL: ""
    });
    const storage = runScript("scripts/migration/export-supabase-storage.mjs", {
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: ""
    });

    expect(database.status).toBe(0);
    expect(database.stdout).toContain("plan only");
    expect(storage.status).toBe(0);
    expect(storage.stdout).toContain("plan only");
  });

  it("keeps the database exporter in plan-only mode for non-production", () => {
    const result = runScript("scripts/migration/export-supabase-postgres.mjs", {
      SUPABASE_DB_URL:
        "postgresql://postgres:secret@db.usuyppgsmmowzizhaoqj.supabase.co:5432/postgres"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("plan only");
    expect(result.stdout).not.toContain("complete bytes=");
  });

  it("refuses the production database before pg_dump can start", () => {
    const result = runScript("scripts/migration/export-supabase-postgres.mjs", {
      SUPABASE_DB_URL:
        "postgresql://postgres:secret@db.gztfmpuqtpvncdcuhqxy.supabase.co:5432/postgres"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to run");
  });

  it("refuses the production Storage project before listing objects", () => {
    const result = runScript("scripts/migration/export-supabase-storage.mjs", {
      SUPABASE_URL: "https://gztfmpuqtpvncdcuhqxy.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to run");
  });
});
