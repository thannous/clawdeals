import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("./audit-cursor", () => ({
  encodeAuditCursor: vi.fn()
}));

import { exportAuditLogsCsv, MAX_EXPORT_ROWS } from "./audit";
import { getSupabaseServiceClient } from "../db/supabase";

function createPagedMockClient(pages: Array<{ data: any[]; error?: any }>) {
  const queue = [...pages];
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => {
      const next = queue.shift() || { data: [], error: null };
      return resolve({ data: next.data, error: next.error || null });
    })
  };
  return chain;
}

const FROM = "2026-02-07T00:00:00Z";
const TO = "2026-02-08T00:00:00Z";

function makeSampleRow(overrides: any = {}) {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    occurred_at: "2026-02-07T12:00:00Z",
    actor: { type: "owner", id: "owner-1" },
    action: { event: "deal.created", entity_type: "deal", entity_id: "deal-1", path: "/api/v1/deals" },
    outcome: "success",
    request_id: "req-123",
    payload_fingerprint: "abc123",
    redacted: false,
    ...overrides
  };
}

describe("exportAuditLogsCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports multiple batches using cursor pagination", async () => {
    const firstPage = Array.from({ length: 501 }, (_, i) =>
      makeSampleRow({
        id: `row-${String(i).padStart(3, "0")}`,
        occurred_at: `2026-02-07T12:${String(i % 60).padStart(2, "0")}:00Z`
      })
    );
    const secondPage = [makeSampleRow({ id: "row-final", occurred_at: "2026-02-07T11:00:00Z" })];
    const mockClient = createPagedMockClient([{ data: firstPage }, { data: secondPage }]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const csv = await exportAuditLogsCsv({ from: FROM, to: TO });

    const lines = csv.split("\n");
    expect(lines).toHaveLength(502);
    expect(lines[1]).toContain("row-000");
    expect(lines[501]).toContain("row-final");
    expect(mockClient.or).toHaveBeenCalled();
  });

  it("throws EXPORT_TOO_LARGE when export exceeds max rows", async () => {
    const firstPage = Array.from({ length: 501 }, (_, i) => makeSampleRow({ id: `first-${i}` }));
    const pages = Array.from({ length: Math.ceil(MAX_EXPORT_ROWS / 500) + 1 }, () => ({ data: firstPage }));
    const mockClient = createPagedMockClient(pages);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    await expect(exportAuditLogsCsv({ from: FROM, to: TO })).rejects.toMatchObject({
      status: 413,
      code: "EXPORT_TOO_LARGE",
      details: { max_rows: MAX_EXPORT_ROWS }
    });
  });
});
