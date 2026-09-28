import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("./audit-cursor", () => ({
  encodeAuditCursor: vi.fn(),
  decodeAuditCursor: vi.fn()
}));

import { getEntityTimeline, replayEntityState } from "./timeline";
import { getSupabaseServiceClient } from "../db/supabase";

function createMockClient(rows: any[] = [], error: any = null) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve({ data: rows, error }))
  };
  return chain;
}

function createSequentialMockClient(resultSequence: Array<{ data: any[]; error: any }>) {
  let callIndex = 0;
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((resolve) => {
      const result = resultSequence[callIndex] || { data: [], error: null };
      callIndex++;
      return resolve(result);
    })
  };
  return chain;
}

const ENTITY_ID = "11111111-2222-3333-8444-555555555555";

function makeSampleRow(overrides: any = {}) {
  return {
    id: "aaaaaaaa-bbbb-1ccc-9ddd-eeeeeeeeeeee",
    occurred_at: "2026-02-07T12:00:00Z",
    actor: { type: "agent", id: "agent-1" },
    action: { event: "listing.create", entity_type: "listing", entity_id: ENTITY_ID, path: "/v1/listings" },
    outcome: "success",
    request_id: "req-123",
    payload_fingerprint: "abc123",
    redacted: false,
    idempotency: { key: "idemp-key-1" },
    payload: {},
    ...overrides
  };
}

describe("getEntityTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not let correlated rows displace primary rows at page limit", async () => {
    const primaryRow1 = makeSampleRow({
      id: "aaaaaaaa-bbbb-1ccc-9ddd-000000000001",
      occurred_at: "2026-02-07T12:00:02Z",
      request_id: "req-123",
      idempotency: { key: null }
    });
    const primaryRow2 = makeSampleRow({
      id: "aaaaaaaa-bbbb-1ccc-9ddd-000000000002",
      occurred_at: "2026-02-07T12:00:03Z",
      request_id: "req-123",
      idempotency: { key: null }
    });
    const correlatedEarlyRow = makeSampleRow({
      id: "aaaaaaaa-bbbb-1ccc-9ddd-000000000003",
      occurred_at: "2026-02-07T12:00:01Z",
      action: {
        event: "deal.created",
        entity_type: "deal",
        entity_id: "22222222-2222-3333-8444-555555555555",
        path: "/api/v1/deals"
      },
      request_id: "req-123",
      idempotency: { key: null }
    });

    const mockClient = createSequentialMockClient([
      { data: [primaryRow1, primaryRow2], error: null }, // primary query
      { data: [correlatedEarlyRow, primaryRow1, primaryRow2], error: null } // request_id correlation
    ]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await getEntityTimeline({ entityType: "listing", entityId: ENTITY_ID, limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.audit_id)).toEqual([primaryRow1.id, primaryRow2.id]);
    expect(result.items.every((item) => item.is_primary)).toBe(true);
  });

  it("deduplicates across primary and correlated results", async () => {
    const row = makeSampleRow();

    const mockClient = createSequentialMockClient([
      { data: [row], error: null },  // primary
      { data: [row], error: null },  // request_id correlation (same row)
      { data: [row], error: null }   // idempotency correlation (same row)
    ]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await getEntityTimeline({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].is_primary).toBe(true);
  });
});

describe("replayEntityState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is_truncated=true when >1000 events", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) =>
      makeSampleRow({
        id: `aaaaaaaa-bbbb-1ccc-9ddd-${String(i).padStart(12, "0")}`,
        occurred_at: `2026-02-07T12:00:00Z`,
        action: { event: "listing.updated", entity_type: "listing", entity_id: ENTITY_ID },
        payload: {}
      })
    );

    const mockClient = createMockClient(rows);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await replayEntityState({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.is_truncated).toBe(true);
    expect(result.steps).toHaveLength(1000);
    expect(result.event_count).toBe(1000);
  });

  it("unknown action produces delta._unknown_action=true", async () => {
    const row = makeSampleRow({
      action: { event: "listing.some_unknown_action", entity_type: "listing", entity_id: ENTITY_ID },
      payload: {}
    });
    const mockClient = createMockClient([row]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await replayEntityState({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].delta).toEqual({ _unknown_action: true });
  });
});
