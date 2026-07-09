import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/audit", () => ({
  listAuditLogs: vi.fn()
}));

vi.mock("../../../server/services/audit-cursor", () => ({
  decodeAuditCursor: vi.fn()
}));

import { handler } from "../../../pages/api/console/audit";
import { listAuditLogs } from "../../../server/services/audit";
import { decodeAuditCursor } from "../../../server/services/audit-cursor";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

const FROM = "2026-02-07T00:00:00Z";
const TO = "2026-02-08T00:00:00Z";

describe("GET /api/console/audit", () => {
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

  it("returns 400 when from is missing", async () => {
    const req = { method: "GET", query: { to: TO } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("TIME_RANGE_REQUIRED");
  });

  it("returns 400 when to is missing", async () => {
    const req = { method: "GET", query: { from: FROM } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("TIME_RANGE_REQUIRED");
  });

  it("returns 400 when from is an invalid date", async () => {
    const req = { method: "GET", query: { from: "invalid", to: TO } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when to is an invalid date", async () => {
    const req = { method: "GET", query: { from: FROM, to: "invalid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns items and next_cursor", async () => {
    vi.mocked(listAuditLogs).mockResolvedValue({
      items: [
        {
          audit_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          ts: "2026-02-07T12:00:00Z",
          actor: { type: "owner", id: "owner-1" },
          action: "deal.created",
          entity: { type: "deal", id: "deal-1" },
          outcome: "success",
          metadata: { hash: "abc123", redacted: false },
          request_id: "req-123"
        }
      ],
      nextCursor: "cursor-abc"
    });

    const req = { method: "GET", query: { from: FROM, to: TO } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].audit_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(result.body.next_cursor).toBe("cursor-abc");
  });

  it("passes filters to service", async () => {
    vi.mocked(listAuditLogs).mockResolvedValue({ items: [], nextCursor: null });

    const req = {
      method: "GET",
      query: {
        from: FROM,
        to: TO,
        actor_type: "agent",
        actor_id: "agent-1",
        action_name: "deal.created",
        entity_type: "deal",
        entity_id: "deal-1",
        outcome: "success",
        request_id: "req-filter-123"
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(listAuditLogs).toHaveBeenCalledWith(expect.objectContaining({
      from: FROM,
      to: TO,
      actorType: "agent",
      actorId: "agent-1",
      actionName: "deal.created",
      entityType: "deal",
      entityId: "deal-1",
      outcome: "success",
      requestId: "req-filter-123"
    }));
  });

  it("validates limit (non-integer -> 400)", async () => {
    const req = { method: "GET", query: { from: FROM, to: TO, limit: "abc" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates limit (out of range -> 400)", async () => {
    const req = { method: "GET", query: { from: FROM, to: TO, limit: "999" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates cursor (decodeAuditCursor returns error -> 400)", async () => {
    vi.mocked(decodeAuditCursor).mockReturnValue({ error: "Invalid cursor" } as any);

    const req = { method: "GET", query: { from: FROM, to: TO, cursor: "bad-cursor" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("default limit is 50", async () => {
    vi.mocked(listAuditLogs).mockResolvedValue({ items: [], nextCursor: null });

    const req = { method: "GET", query: { from: FROM, to: TO } };
    await handler(req, null, { ...baseCtx });

    expect(listAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it("sets ctx.auditEvent = 'audit.listed'", async () => {
    vi.mocked(listAuditLogs).mockResolvedValue({ items: [], nextCursor: null });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: { from: FROM, to: TO } };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("audit.listed");
  });

  it("handles service error (500 with code)", async () => {
    vi.mocked(listAuditLogs).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: { from: FROM, to: TO } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });

  it("custom limit passed to service", async () => {
    vi.mocked(listAuditLogs).mockResolvedValue({ items: [], nextCursor: null });

    const req = { method: "GET", query: { from: FROM, to: TO, limit: "25" } };
    await handler(req, null, { ...baseCtx });

    expect(listAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });
});
