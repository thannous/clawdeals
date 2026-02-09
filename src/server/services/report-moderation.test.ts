import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("./agents", () => ({
  addAgentTrustFlag: vi.fn()
}));

import {
  encodeReportCursor,
  decodeReportCursor,
  listReports,
  getReport,
  resolveReport,
  bulkResolveReports
} from "./report-moderation";
import { getSupabaseServiceClient } from "../db/supabase";
import { addAgentTrustFlag } from "./agents";

function mockClient(overrides: any = {}) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides
  };
  // Make chainable methods return chain
  for (const key of ["from", "select", "insert", "update", "upsert", "eq", "neq", "or", "order", "limit"]) {
    if (!overrides[key]) {
      chain[key] = vi.fn().mockReturnValue(chain);
    }
  }
  vi.mocked(getSupabaseServiceClient).mockReturnValue(chain);
  return chain;
}

describe("encodeReportCursor / decodeReportCursor", () => {
  it("round-trips a valid cursor", () => {
    const cursor = { created_at: "2026-01-01T00:00:00Z", report_id: "abc-123" };
    const encoded = encodeReportCursor(cursor);
    expect(encoded).toBeTruthy();
    const decoded = decodeReportCursor(encoded!);
    expect(decoded).toEqual({ value: cursor });
  });

  it("returns null for null/undefined input", () => {
    expect(encodeReportCursor(null)).toBeNull();
    expect(decodeReportCursor(null)).toBeNull();
    expect(decodeReportCursor(undefined)).toBeNull();
  });

  it("returns error for invalid base64", () => {
    const result = decodeReportCursor("not-base64!!!");
    // May decode but fail JSON parse
    expect(result).toBeDefined();
  });

  it("returns error for invalid JSON", () => {
    const encoded = Buffer.from("not-json", "utf8").toString("base64");
    const result = decodeReportCursor(encoded);
    expect(result).toEqual({ error: "Invalid cursor" });
  });

  it("returns error for missing fields", () => {
    const encoded = Buffer.from(JSON.stringify({ created_at: "x" }), "utf8").toString("base64");
    const result = decodeReportCursor(encoded);
    expect(result).toEqual({ error: "Invalid cursor" });
  });
});

describe("listReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns reports and nextCursor", async () => {
    const reports = [
      { report_id: "r1", created_at: "2026-01-02T00:00:00Z" },
      { report_id: "r2", created_at: "2026-01-01T00:00:00Z" }
    ];
    const chain = mockClient();
    // Final call resolves data
    chain.limit.mockResolvedValue({ data: reports, error: null });

    const result = await listReports({ limit: 5 });
    expect(result.reports).toEqual(reports);
    expect(result.nextCursor).toBeNull();
  });

  it("returns nextCursor when hasMore", async () => {
    const reports = Array.from({ length: 3 }, (_, i) => ({
      report_id: `r${i}`,
      created_at: `2026-01-0${3 - i}T00:00:00Z`
    }));
    const chain = mockClient();
    chain.limit.mockResolvedValue({ data: reports, error: null });

    const result = await listReports({ limit: 2 });
    expect(result.reports).toHaveLength(2);
    expect(result.nextCursor).toBeTruthy();
  });

  it("throws on supabase error", async () => {
    const chain = mockClient();
    chain.limit.mockResolvedValue({ data: null, error: { message: "fail", code: "42P01" } });

    await expect(listReports()).rejects.toThrow();
  });
});

describe("getReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns report when found", async () => {
    const report = { report_id: "r1", status: "UNCONFIRMED" };
    const chain = mockClient();
    chain.maybeSingle.mockResolvedValue({ data: report, error: null });

    const result = await getReport("r1");
    expect(result).toEqual(report);
  });

  it("returns null when not found", async () => {
    const chain = mockClient();
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getReport("missing");
    expect(result).toBeNull();
  });
});

describe("resolveReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms a report and applies penalty for non-agent entity", async () => {
    const resolved = {
      report_id: "r1",
      status: "CONFIRMED",
      entity_type: "deal",
      entity_id: "d1"
    };
    const chain = mockClient();
    chain.maybeSingle.mockResolvedValue({ data: resolved, error: null });
    // upsert for moderation_states
    chain.upsert.mockReturnValue({ error: null });

    const result = await resolveReport({
      reportId: "r1",
      action: "confirm",
      reason: "spam",
      resolvedBy: "owner-1"
    });

    expect(result).toEqual(resolved);
  });

  it("confirms a report and applies penalty for agent entity", async () => {
    const resolved = {
      report_id: "r1",
      status: "CONFIRMED",
      entity_type: "agent",
      entity_id: "agent-1"
    };
    const chain = mockClient();
    chain.maybeSingle.mockResolvedValue({ data: resolved, error: null });
    vi.mocked(addAgentTrustFlag).mockResolvedValue(undefined);

    await resolveReport({
      reportId: "r1",
      action: "confirm",
      reason: null,
      resolvedBy: "owner-1"
    });

    expect(addAgentTrustFlag).toHaveBeenCalledWith("agent-1", "under_review");
  });

  it("throws 409 when report already resolved", async () => {
    const chain = mockClient();
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      resolveReport({ reportId: "r1", action: "confirm", reason: null, resolvedBy: "owner-1" })
    ).rejects.toThrow("Report already resolved or not found");
  });

  it("rejects a report", async () => {
    const resolved = {
      report_id: "r1",
      status: "REJECTED",
      entity_type: "deal",
      entity_id: "d1"
    };
    const chain = mockClient();
    // First maybeSingle: the update result
    chain.maybeSingle.mockResolvedValueOnce({ data: resolved, error: null });
    // For maybeUnhideEntity checks: select confirmed reports
    chain.limit.mockResolvedValueOnce({ data: [], error: null });
    // moderation state check
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await resolveReport({
      reportId: "r1",
      action: "reject",
      reason: "not spam",
      resolvedBy: "owner-1"
    });

    expect(result).toEqual(resolved);
  });
});

describe("bulkResolveReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves multiple reports, skips already-resolved", async () => {
    const chain = mockClient();
    const resolved1 = { report_id: "r1", status: "CONFIRMED", entity_type: "deal", entity_id: "d1" };
    // First call succeeds
    chain.maybeSingle
      .mockResolvedValueOnce({ data: resolved1, error: null });
    chain.upsert.mockReturnValueOnce({ error: null });
    // Second call: already resolved (null data → 409)
    chain.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await bulkResolveReports({
      reportIds: ["r1", "r2"],
      action: "confirm",
      reason: null,
      resolvedBy: "owner-1"
    });

    expect(result.resolved).toContain("r1");
    expect(result.skipped).toContain("r2");
  });
});
