import { beforeEach, describe, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({ query }) }));
import { ensureNeonRuntimeRole, resetNeonSqlForTests } from "./neon";
const safe = { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolinherit: false, assumed_role: false, can_create_database_objects: false, can_temp: false, owns_database: false, elevated_membership: false, owns_tables: false, owns_schema: false };
beforeEach(() => { resetNeonSqlForTests(); query.mockReset(); vi.stubEnv("DATABASE_URL", "postgresql://fixture.invalid/db"); });
describe("runtime role safety gate", () => {
  it("accepts and caches a fully restricted role", async () => {
    query.mockResolvedValue([safe]);
    await ensureNeonRuntimeRole(); await ensureNeonRuntimeRole();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("'MEMBER'");
    expect(query.mock.calls[0][0]).toContain("'TEMP'");
    expect(query.mock.calls[0][0]).toContain("current_user<>session_user AS assumed_role");
    expect(query.mock.calls[0][0]).toContain("current_database(),'CREATE') AS can_create_database_objects");
    expect(query.mock.calls[0][0]).toContain("r.rolinherit");
    expect(query.mock.calls[0][0]).toContain("pg_has_role(current_user,p.oid,'MEMBER')) AS elevated_membership");
    expect(query.mock.calls[0][0]).not.toContain("p.rolsuper");
  });
  it.each(Object.keys(safe))("rejects %s", async (key) => {
    query.mockResolvedValue([{ ...safe, [key]: true }]);
    await expect(ensureNeonRuntimeRole()).rejects.toThrow("dedicated non-owner");
  });
  it("does not treat a failed/empty role inspection as authorization", async () => {
    query.mockResolvedValue([]);
    await expect(ensureNeonRuntimeRole()).rejects.toThrow();
  });
  it("recovers from an initial outage while still rejecting an unsafe role", async () => {
    const outage = new Error("Transient Neon wake failure");
    query.mockRejectedValueOnce(outage)
      .mockResolvedValueOnce([{ ...safe, can_temp: true }])
      .mockResolvedValue([safe]);

    const initial = await Promise.allSettled([ensureNeonRuntimeRole(), ensureNeonRuntimeRole()]);
    expect(initial).toEqual([
      { status: "rejected", reason: outage },
      { status: "rejected", reason: outage },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    await expect(ensureNeonRuntimeRole()).rejects.toThrow("dedicated non-owner");
    expect(query).toHaveBeenCalledTimes(2);
    await ensureNeonRuntimeRole();
    await ensureNeonRuntimeRole();
    expect(query).toHaveBeenCalledTimes(3);
  });
});
