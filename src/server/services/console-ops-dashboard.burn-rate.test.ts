import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();
const mockClient = { from: mockFrom };

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: () => mockClient
}));

vi.mock("./supabase-errors", () => ({
  mapSupabaseError: (err: any) => ({
    message: err?.message || "DB error",
    status: err?.status || 500,
    code: err?.code || "DB_ERROR"
  })
}));

import { getConsoleOpsDashboard } from "./console-ops-dashboard";

function countChain(count: number) {
  const chain: any = {};
  const methods = ["select", "eq", "is", "not", "in", "or", "order", "limit"];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: null, error: null, count }).then(resolve, reject);
  return chain;
}

function rowsChain(rows: any[] = []) {
  const chain: any = {};
  const methods = ["select", "eq", "is", "not", "in", "or", "order", "limit", "gte", "lt"];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve, reject);
  return chain;
}

function auditWindowChain(allRows: any[]) {
  const chain: any = {};
  let fromIso: string | null = null;
  let toIso: string | null = null;

  chain.select = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn((col: string, value: string) => {
    if (col === "occurred_at") fromIso = value;
    return chain;
  });
  chain.lt = vi.fn((col: string, value: string) => {
    if (col === "occurred_at") toIso = value;
    return chain;
  });
  chain.then = (resolve: any, reject: any) => {
    const filtered = allRows.filter((row) => {
      const ts = new Date(row?.occurred_at).getTime();
      if (Number.isNaN(ts)) return false;
      if (fromIso && ts < new Date(fromIso).getTime()) return false;
      if (toIso && ts >= new Date(toIso).getTime()) return false;
      return true;
    });
    return Promise.resolve({ data: filtered, error: null, count: filtered.length }).then(resolve, reject);
  };
  return chain;
}

function auditRow(event: string, outcome: "SUCCESS" | "FAILURE", occurredAt: string) {
  return {
    id: crypto.randomUUID(),
    occurred_at: occurredAt,
    outcome,
    action: { event, route_group: "deals" },
    request: { status_code: outcome === "SUCCESS" ? 200 : 500, duration_ms: 100 },
    auth: { agent_id: "agent-1" }
  };
}

describe("getConsoleOpsDashboard burn-rate lookback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a full 1h lookback for slow burn-rate even when window is 15m", async () => {
    const now = new Date("2026-02-11T12:00:00.000Z");
    const rows = [
      auditRow("deal.create", "SUCCESS", "2026-02-11T11:58:00.000Z"),
      auditRow("deal.create", "FAILURE", "2026-02-11T11:57:00.000Z"),
      auditRow("listing.create", "SUCCESS", "2026-02-11T11:30:00.000Z"),
      auditRow("offer.create", "SUCCESS", "2026-02-11T11:20:00.000Z")
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "audit_logs") return auditWindowChain(rows);
      if (table === "approvals") return rowsChain([]);
      return countChain(0);
    });

    const result = await getConsoleOpsDashboard({
      windowMinutes: 15,
      now,
      client: mockClient
    });

    expect(result.sample.audit_rows).toBe(2);
    expect(result.sli.write_journeys.burn_rate.fast.value).toBe(50);
    expect(result.sli.write_journeys.burn_rate.slow.value).toBe(25);
  });
});
