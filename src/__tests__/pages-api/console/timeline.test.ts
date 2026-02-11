import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/timeline", () => ({
  getEntityTimeline: vi.fn()
}));

vi.mock("../../../server/services/audit-cursor", () => ({
  decodeAuditCursor: vi.fn()
}));

import { handler } from "../../../pages/api/console/timeline";
import { getEntityTimeline } from "../../../server/services/timeline";
import { decodeAuditCursor } from "../../../server/services/audit-cursor";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

const ENTITY_TYPE = "listing";
const ENTITY_ID = "11111111-2222-3333-a444-555555555555";

describe("GET /api/console/timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-GET methods", async () => {
    const req = { method: "POST", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when entity_type is missing", async () => {
    const req = { method: "GET", query: { entity_id: ENTITY_ID } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when entity_id is missing", async () => {
    const req = { method: "GET", query: { entity_type: ENTITY_TYPE } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when entity_id is not a UUID", async () => {
    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 200 with valid params", async () => {
    vi.mocked(getEntityTimeline).mockResolvedValue({
      entity: { type: ENTITY_TYPE, id: ENTITY_ID },
      items: [
        {
          audit_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          ts: "2026-02-07T12:00:00Z",
          actor: { type: "agent", id: "agent-1" },
          action: "listing.create",
          entity: { type: "listing", id: ENTITY_ID },
          outcome: "success",
          metadata: { hash: "abc123", redacted: false },
          request_id: "req-123",
          idempotency_key: null,
          is_primary: true,
          correlation_source: null
        }
      ],
      nextCursor: "cursor-abc",
      correlation: { request_ids: ["req-123"], idempotency_keys: [], correlated_entity_count: 0 }
    });

    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.entity).toEqual({ type: ENTITY_TYPE, id: ENTITY_ID });
    expect(result.body.items).toHaveLength(1);
    expect(result.body.next_cursor).toBe("cursor-abc");
    expect(result.body.correlation).toBeDefined();
  });

  it("passes include_correlated=false to service", async () => {
    vi.mocked(getEntityTimeline).mockResolvedValue({
      entity: { type: ENTITY_TYPE, id: ENTITY_ID },
      items: [],
      nextCursor: null,
      correlation: { request_ids: [], idempotency_keys: [], correlated_entity_count: 0 }
    });

    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID, include_correlated: "false" } };
    await handler(req, null, { ...baseCtx });

    expect(getEntityTimeline).toHaveBeenCalledWith(expect.objectContaining({
      includeCorrelated: false
    }));
  });

  it("validates limit (non-integer -> 400)", async () => {
    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID, limit: "abc" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates limit (out of range -> 400)", async () => {
    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID, limit: "999" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates cursor (decodeAuditCursor returns error -> 400)", async () => {
    vi.mocked(decodeAuditCursor).mockReturnValue({ error: "Invalid cursor" } as any);

    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID, cursor: "bad-cursor" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sets ctx.auditEvent = 'timeline.viewed'", async () => {
    vi.mocked(getEntityTimeline).mockResolvedValue({
      entity: { type: ENTITY_TYPE, id: ENTITY_ID },
      items: [],
      nextCursor: null,
      correlation: { request_ids: [], idempotency_keys: [], correlated_entity_count: 0 }
    });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID } };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("timeline.viewed");
  });

  it("handles service error (500 with code)", async () => {
    vi.mocked(getEntityTimeline).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });

  it("default limit is 200", async () => {
    vi.mocked(getEntityTimeline).mockResolvedValue({
      entity: { type: ENTITY_TYPE, id: ENTITY_ID },
      items: [],
      nextCursor: null,
      correlation: { request_ids: [], idempotency_keys: [], correlated_entity_count: 0 }
    });

    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID } };
    await handler(req, null, { ...baseCtx });

    expect(getEntityTimeline).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
  });

  it("custom limit passed to service", async () => {
    vi.mocked(getEntityTimeline).mockResolvedValue({
      entity: { type: ENTITY_TYPE, id: ENTITY_ID },
      items: [],
      nextCursor: null,
      correlation: { request_ids: [], idempotency_keys: [], correlated_entity_count: 0 }
    });

    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID, limit: "50" } };
    await handler(req, null, { ...baseCtx });

    expect(getEntityTimeline).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it("returns 401 on authError", async () => {
    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID } };
    const ctx = { ...baseCtx, authError: { status: 401, code: "TOKEN_EXPIRED", message: "Token expired" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("TOKEN_EXPIRED");
  });
});
