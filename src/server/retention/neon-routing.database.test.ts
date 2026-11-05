import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createNeonDataClient } from "../db/neon-client";
import { runAuditRetention } from "../audit/retention";
import { runReportsRetention } from "../services/reports-retention";
import { ensureFuturePartitions } from "./partition-manager";
import { missingRetentionConfiguration } from "./shared";
const state = vi.hoisted(() => ({ client: null as any }));
vi.mock("../db/neon-client", async (original) => ({ ...await original<any>(), getNeonDataClient: () => state.client }));
describe("Neon retention never sends mutations to the old source", () => {
  let db: PGlite;
  const env = { NODE_ENV: "test" as const, CLAWDEALS_DATABASE_BACKEND: "neon", DATABASE_URL: "postgres://local-fixture", SUPABASE_URL: "https://old-source.invalid", SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key" };
  const now = new Date("2026-11-05T00:00:00Z");
  beforeAll(async () => {
    db = new PGlite();
    state.client = createNeonDataClient(async (sql, params) => (await db.query(sql, params)).rows as any);
    await db.exec(`create table audit_logs(id int,occurred_at timestamptz,payload jsonb,redacted boolean,ip_full text,user_agent text);
      create table reports(id int,created_at timestamptz,free_text_redacted text);
      create function ensure_audit_log_partitions() returns jsonb language sql as $$select '{"partitions":["audit_logs_2026_11","audit_logs_2026_12","audit_logs_2027_01"]}'::jsonb$$;`);
  }, 30000);
  afterAll(async () => { await db?.close(); });
  afterEach(() => vi.unstubAllGlobals());
  it("deletes expired audit records and redacts older retained rows via PostgreSQL", async () => {
    const fetch = vi.fn(() => { throw new Error("Source HTTP forbidden"); }); vi.stubGlobal("fetch", fetch);
    await db.exec(`insert into audit_logs values(1,'2026-01-01','{}',false,'ip','ua'),(2,'2026-10-01','{"private":true}',false,'ip','ua'),(3,'2026-11-04','{"keep":true}',false,'ip','ua')`);
    const result = await runAuditRetention({ env: { ...env, AUDIT_RETENTION_DAYS: "90", AUDIT_PAYLOAD_RETENTION_DAYS: "10", AUDIT_IP_FULL_RETENTION_DAYS: "10", AUDIT_USER_AGENT_RETENTION_DAYS: "10" }, now });
    expect(result.delete.affected).toBe(1); expect(result.payload.affected).toBe(1);
    expect((await db.query("select id,payload,ip_full,user_agent from audit_logs order by id")).rows).toEqual([{ id: 2, payload: {}, ip_full: null, user_agent: null }, { id: 3, payload: { keep: true }, ip_full: "ip", user_agent: "ua" }]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("deletes and redacts reports despite lingering source credentials", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await db.exec("insert into reports values(1,'2026-01-01','old'),(2,'2026-10-01','private'),(3,'2026-11-04','keep')");
    const result = await runReportsRetention({ env: { ...env, REPORTS_RETENTION_DAYS: "90", REPORTS_PII_RETENTION_DAYS: "10" }, now });
    expect(result.delete.affected).toBe(1); expect(result.pii_redaction.affected).toBe(1);
    expect((await db.query("select id,free_text_redacted from reports order by id")).rows).toEqual([{ id: 2, free_text_redacted: null }, { id: 3, free_text_redacted: "keep" }]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("calls the partition RPC on PostgreSQL, never source REST", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await ensureFuturePartitions({ env })).partitions).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed without Neon configuration and preserves the default source skip", async () => {
    await expect(runAuditRetention({ env: { CLAWDEALS_DATABASE_BACKEND: "neon" } })).rejects.toThrow("DATABASE_URL");
    await expect(runReportsRetention({ env: { CLAWDEALS_DATABASE_BACKEND: "neon" } })).rejects.toThrow("DATABASE_URL");
    expect(missingRetentionConfiguration({ NODE_ENV: "test", CLAWDEALS_DATABASE_BACKEND: "neon", DATABASE_URL: "fixture" })).toBeNull();
    expect(await runAuditRetention({ env: { CLAWDEALS_DATABASE_BACKEND: "supabase" } })).toMatchObject({ skipped: true });
  });
});
