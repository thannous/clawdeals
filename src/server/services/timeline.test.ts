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
import { encodeAuditCursor, decodeAuditCursor } from "./audit-cursor";

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

  it("throws VALIDATION_ERROR when entityType is missing", async () => {
    await expect(getEntityTimeline({ entityId: ENTITY_ID } as any)).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR"
    });
  });

  it("throws VALIDATION_ERROR when entityId is missing", async () => {
    await expect(getEntityTimeline({ entityType: "listing" } as any)).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR"
    });
  });

  it("throws VALIDATION_ERROR when entityId is not a UUID", async () => {
    await expect(getEntityTimeline({ entityType: "listing", entityId: "not-a-uuid" })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR"
    });
  });

  it("throws VALIDATION_ERROR when limit > 500", async () => {
    await expect(getEntityTimeline({ entityType: "listing", entityId: ENTITY_ID, limit: 501 })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR"
    });
  });

  it("returns empty items when no audit rows", async () => {
    const mockClient = createMockClient([]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await getEntityTimeline({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("maps entries in chronological order with is_primary=true", async () => {
    const row = makeSampleRow();
    const mockClient = createMockClient([row]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await getEntityTimeline({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      audit_id: row.id,
      ts: row.occurred_at,
      actor: { type: "agent", id: "agent-1" },
      action: "listing.create",
      entity: { type: "listing", id: ENTITY_ID },
      outcome: "success",
      metadata: { hash: "abc123", redacted: false },
      request_id: "req-123",
      idempotency_key: "idemp-key-1",
      is_primary: true,
      correlation_source: null
    });
  });

  it("correlates by request_id and merges sibling events", async () => {
    const primaryRow = makeSampleRow();
    const correlatedRow = makeSampleRow({
      id: "cccccccc-dddd-1eee-9fff-000000000000",
      occurred_at: "2026-02-07T12:00:01Z",
      action: { event: "deal.created", entity_type: "deal", entity_id: "deal-1", path: "/api/v1/deals" },
      request_id: "req-123",
      idempotency: { key: null }
    });

    const mockClient = createSequentialMockClient([
      { data: [primaryRow], error: null },        // primary query
      { data: [primaryRow, correlatedRow], error: null }, // request_id correlation
      { data: [], error: null }                    // idempotency correlation (no idemp keys)
    ]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await getEntityTimeline({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].is_primary).toBe(true);
    expect(result.items[1].is_primary).toBe(false);
    expect(result.items[1].correlation_source).toBe("request_id");
  });

  it("correlates by idempotency_key and merges related events", async () => {
    const primaryRow = makeSampleRow({ request_id: null });
    const correlatedRow = makeSampleRow({
      id: "cccccccc-dddd-1eee-9fff-000000000000",
      occurred_at: "2026-02-07T12:00:01Z",
      action: { event: "deal.created", entity_type: "deal", entity_id: "deal-1", path: "/api/v1/deals" },
      request_id: null,
      idempotency: { key: "idemp-key-1" }
    });

    const mockClient = createSequentialMockClient([
      { data: [primaryRow], error: null },         // primary query
      // no request_id correlation (request_id is null)
      { data: [primaryRow, correlatedRow], error: null } // idempotency correlation
    ]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await getEntityTimeline({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].is_primary).toBe(true);
    expect(result.items[1].is_primary).toBe(false);
    expect(result.items[1].correlation_source).toBe("idempotency_key");
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

  it("skips correlation queries when includeCorrelated=false", async () => {
    const row = makeSampleRow();
    const mockClient = createMockClient([row]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await getEntityTimeline({
      entityType: "listing",
      entityId: ENTITY_ID,
      includeCorrelated: false
    });

    expect(result.items).toHaveLength(1);
    // Only one .then call (the primary query) — no correlation queries
    expect(mockClient.then).toHaveBeenCalledTimes(1);
  });

  it("returns nextCursor when hasMore", async () => {
    const rows = Array.from({ length: 201 }, (_, i) =>
      makeSampleRow({ id: `aaaaaaaa-bbbb-1ccc-9ddd-${String(i).padStart(12, "0")}`, request_id: null, idempotency: { key: null } })
    );
    const mockClient = createMockClient(rows);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);
    vi.mocked(encodeAuditCursor).mockReturnValue("cursor-abc");

    const result = await getEntityTimeline({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.items).toHaveLength(200);
    expect(result.nextCursor).toBe("cursor-abc");
    expect(encodeAuditCursor).toHaveBeenCalledWith({
      occurred_at: rows[199].occurred_at,
      id: rows[199].id
    });
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

  it("returns empty steps when no audit rows", async () => {
    const mockClient = createMockClient([]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await replayEntityState({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.steps).toHaveLength(0);
    expect(result.current_state).toEqual({});
    expect(result.event_count).toBe(0);
  });

  it("transaction reducer: offer.create sets DRAFT status", async () => {
    const row = makeSampleRow({
      action: { event: "offer.create", entity_type: "transaction", entity_id: ENTITY_ID },
      payload: { amount: 100, currency: "EUR" }
    });
    const mockClient = createMockClient([row]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await replayEntityState({ entityType: "transaction", entityId: ENTITY_ID });

    expect(result.steps).toHaveLength(1);
    expect(result.current_state).toEqual({ status: "DRAFT", amount: 100, currency: "EUR" });
    expect(result.steps[0].delta).toEqual({ status: "DRAFT", amount: 100, currency: "EUR" });
  });

  it("transaction reducer: full lifecycle (5 events)", async () => {
    const makeRow = (i: number, event: string, payload: any = {}) =>
      makeSampleRow({
        id: `aaaaaaaa-bbbb-1ccc-9ddd-${String(i).padStart(12, "0")}`,
        occurred_at: `2026-02-07T12:0${i}:00Z`,
        action: { event, entity_type: "transaction", entity_id: ENTITY_ID },
        payload
      });

    const rows = [
      makeRow(0, "offer.create", { amount: 50 }),
      makeRow(1, "offer.accept"),
      makeRow(2, "transaction.created"),
      makeRow(3, "escrow.funded"),
      makeRow(4, "transaction.completed")
    ];

    const mockClient = createMockClient(rows);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await replayEntityState({ entityType: "transaction", entityId: ENTITY_ID });

    expect(result.steps).toHaveLength(5);
    expect(result.current_state).toEqual({
      status: "COMPLETED",
      amount: 50,
      escrow_status: "FUNDED"
    });
    expect(result.steps[0].delta.status).toBe("DRAFT");
    expect(result.steps[1].delta.status).toBe("ACCEPTED");
    expect(result.steps[2].delta.status).toBe("PENDING");
    expect(result.steps[3].delta.escrow_status).toBe("FUNDED");
    expect(result.steps[4].delta.status).toBe("COMPLETED");
  });

  it("listing reducer: create + update + status_changed", async () => {
    const makeRow = (i: number, event: string, payload: any = {}) =>
      makeSampleRow({
        id: `aaaaaaaa-bbbb-1ccc-9ddd-${String(i).padStart(12, "0")}`,
        occurred_at: `2026-02-07T12:0${i}:00Z`,
        action: { event, entity_type: "listing", entity_id: ENTITY_ID },
        payload
      });

    const rows = [
      makeRow(0, "listing.create", { title: "My Listing", price: 25 }),
      makeRow(1, "listing.updated", { price: 30 }),
      makeRow(2, "listing.status_changed", { status: "SOLD" })
    ];

    const mockClient = createMockClient(rows);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await replayEntityState({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.steps).toHaveLength(3);
    expect(result.current_state).toEqual({ status: "SOLD", title: "My Listing", price: 30 });
    expect(result.steps[0].delta).toEqual({ status: "ACTIVE", title: "My Listing", price: 25 });
    expect(result.steps[1].delta).toEqual({ price: 30 });
    expect(result.steps[2].delta).toEqual({ status: "SOLD" });
  });

  it("redacted payload produces delta._redacted=true", async () => {
    const row = makeSampleRow({
      redacted: true,
      action: { event: "listing.create", entity_type: "listing", entity_id: ENTITY_ID },
      payload: { title: "secret" }
    });
    const mockClient = createMockClient([row]);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await replayEntityState({ entityType: "listing", entityId: ENTITY_ID });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].delta).toEqual({ _redacted: true });
  });

  it("upToAuditId stops processing at specified event", async () => {
    const makeRow = (i: number, event: string) =>
      makeSampleRow({
        id: `aaaaaaaa-bbbb-1ccc-9ddd-${String(i).padStart(12, "0")}`,
        occurred_at: `2026-02-07T12:0${i}:00Z`,
        action: { event, entity_type: "listing", entity_id: ENTITY_ID },
        payload: { title: `Title ${i}` }
      });

    const rows = [
      makeRow(0, "listing.create"),
      makeRow(1, "listing.updated"),
      makeRow(2, "listing.status_changed")
    ];

    const stopId = rows[1].id;
    const mockClient = createMockClient(rows);
    vi.mocked(getSupabaseServiceClient).mockReturnValue(mockClient as any);

    const result = await replayEntityState({ entityType: "listing", entityId: ENTITY_ID, upToAuditId: stopId });

    expect(result.steps).toHaveLength(2);
    expect(result.up_to_audit_id).toBe(stopId);
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
