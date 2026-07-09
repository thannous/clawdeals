import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("./audit-cursor", () => ({
  encodeAuditCursor: vi.fn()
}));

import { listAuditLogs, exportAuditLogsCsv, MAX_EXPORT_ROWS } from "./audit";
import { getSupabaseServiceClient } from "../db/supabase";
import { encodeAuditCursor } from "./audit-cursor";

function createMockClient(rows: any[] = [], error: any = null) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve({ data: rows, error }))
  };
  return chain;
}

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

describe("listAuditLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws TIME_RANGE_REQUIRED when from is missing", async () => {
    await expect(listAuditLogs({ to: TO })).rejects.toMatchObject({
      status: 400,
      code: "TIME_RANGE_REQUIRED"
    });
  });

  it("throws TIME_RANGE_REQUIRED when to is missing", async () => {
    await expect(listAuditLogs({ from: FROM })).rejects.toMatchObject({
      status: 400,
      code: "TIME_RANGE_REQUIRED"
    });
  });

  it("throws TIME_RANGE_TOO_LARGE when range exceeds 7 days", async () => {
    await expect(listAuditLogs({
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-15T00:00:00Z"
    })).rejects.toMatchObject({
      status: 400,
      code: "TIME_RANGE_TOO_LARGE"
    });
  });

  it("returns mapped items", async () => {
    const row = makeSampleRow();
    const mockClient = createMockClient([row]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await listAuditLogs({ from: FROM, to: TO });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      audit_id: row.id,
      ts: row.occurred_at,
      actor: { type: "owner", id: "owner-1" },
      action: "deal.created",
      entity: { type: "deal", id: "deal-1" },
      outcome: "success",
      metadata: { hash: "abc123", redacted: false },
      request_id: "req-123"
    });
  });

  it("returns nextCursor when hasMore", async () => {
    // Default limit is 50, so we need 51 rows to trigger hasMore
    const rows = Array.from({ length: 51 }, (_, i) => makeSampleRow({ id: `id-${i}` }));
    const mockClient = createMockClient(rows);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);
    vi.mocked(encodeAuditCursor).mockReturnValue("cursor-abc");

    const result = await listAuditLogs({ from: FROM, to: TO });

    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBe("cursor-abc");
    expect(encodeAuditCursor).toHaveBeenCalledWith({
      occurred_at: rows[49].occurred_at,
      id: rows[49].id
    });
  });

  it("returns null nextCursor when no more results", async () => {
    const rows = [makeSampleRow()];
    const mockClient = createMockClient(rows);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await listAuditLogs({ from: FROM, to: TO });

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("applies filters to the query", async () => {
    const mockClient = createMockClient([]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    await listAuditLogs({
      from: FROM,
      to: TO,
      actorType: "agent",
      actionName: "deal.created",
      outcome: "success"
    });

    expect(mockClient.eq).toHaveBeenCalledWith("actor->>type", "agent");
    expect(mockClient.eq).toHaveBeenCalledWith("action->>event", "deal.created");
    expect(mockClient.eq).toHaveBeenCalledWith("outcome", "success");
  });

  it("applies request_id filter to the query", async () => {
    const mockClient = createMockClient([]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    await listAuditLogs({
      from: FROM,
      to: TO,
      requestId: "req-123"
    });

    expect(mockClient.eq).toHaveBeenCalledWith("request_id", "req-123");
  });

  it("applies cursor to the query", async () => {
    const mockClient = createMockClient([]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    await listAuditLogs({
      from: FROM,
      to: TO,
      cursor: { occurred_at: "2026-02-07T06:00:00Z", id: "some-id" }
    });

    expect(mockClient.or).toHaveBeenCalled();
  });
});

describe("exportAuditLogsCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws TIME_RANGE_REQUIRED when from is missing", async () => {
    await expect(exportAuditLogsCsv({ to: TO })).rejects.toMatchObject({
      status: 400,
      code: "TIME_RANGE_REQUIRED"
    });
  });

  it("throws TIME_RANGE_REQUIRED when to is missing", async () => {
    await expect(exportAuditLogsCsv({ from: FROM })).rejects.toMatchObject({
      status: 400,
      code: "TIME_RANGE_REQUIRED"
    });
  });

  it("throws TIME_RANGE_TOO_LARGE when range exceeds 7 days", async () => {
    await expect(exportAuditLogsCsv({
      from: "2026-01-01T00:00:00Z",
      to: "2026-01-15T00:00:00Z"
    })).rejects.toMatchObject({
      status: 400,
      code: "TIME_RANGE_TOO_LARGE"
    });
  });

  it("returns valid CSV with header line", async () => {
    const row = makeSampleRow();
    const mockClient = createMockClient([row]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const csv = await exportAuditLogsCsv({ from: FROM, to: TO });

    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "audit_id,timestamp,actor_type,actor_id,action,entity_type,entity_id,outcome,metadata_hash,request_id"
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(row.id);
    expect(lines[1]).toContain("deal.created");
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

  it("applies request_id filter to export query", async () => {
    const mockClient = createMockClient([]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    await exportAuditLogsCsv({ from: FROM, to: TO, requestId: "req-123" });

    expect(mockClient.eq).toHaveBeenCalledWith("request_id", "req-123");
  });

  it("returns only header when no rows", async () => {
    const mockClient = createMockClient([]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const csv = await exportAuditLogsCsv({ from: FROM, to: TO });

    const lines = csv.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("audit_id");
  });
});
