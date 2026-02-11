import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/timeline", () => ({
  replayEntityState: vi.fn()
}));

import { handler } from "../../../../pages/api/console/timeline/replay";
import { replayEntityState } from "../../../../server/services/timeline";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

const ENTITY_TYPE = "transaction";
const ENTITY_ID = "11111111-2222-3333-a444-555555555555";
const AUDIT_ID = "aaaaaaaa-bbbb-1ccc-9ddd-eeeeeeeeeeee";

describe("GET /api/console/timeline/replay", () => {
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

  it("returns 400 when up_to_audit_id is not a UUID", async () => {
    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID, up_to_audit_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 200 with valid params (no up_to_audit_id)", async () => {
    vi.mocked(replayEntityState).mockResolvedValue({
      entity: { type: ENTITY_TYPE, id: ENTITY_ID },
      current_state: { status: "COMPLETED" },
      steps: [
        { audit_id: AUDIT_ID, ts: "2026-02-07T12:00:00Z", action: "transaction.created", outcome: "success", state_after: { status: "PENDING" }, delta: { status: "PENDING" } }
      ],
      up_to_audit_id: AUDIT_ID,
      event_count: 1,
      is_truncated: false
    });

    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.entity).toEqual({ type: ENTITY_TYPE, id: ENTITY_ID });
    expect(result.body.steps).toHaveLength(1);
    expect(result.body.current_state).toEqual({ status: "COMPLETED" });
  });

  it("returns 200 with up_to_audit_id", async () => {
    vi.mocked(replayEntityState).mockResolvedValue({
      entity: { type: ENTITY_TYPE, id: ENTITY_ID },
      current_state: { status: "PENDING" },
      steps: [
        { audit_id: AUDIT_ID, ts: "2026-02-07T12:00:00Z", action: "transaction.created", outcome: "success", state_after: { status: "PENDING" }, delta: { status: "PENDING" } }
      ],
      up_to_audit_id: AUDIT_ID,
      event_count: 1,
      is_truncated: false
    });

    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID, up_to_audit_id: AUDIT_ID } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(replayEntityState).toHaveBeenCalledWith(expect.objectContaining({
      entityType: ENTITY_TYPE,
      entityId: ENTITY_ID,
      upToAuditId: AUDIT_ID
    }));
  });

  it("sets ctx.auditEvent = 'timeline.replay.viewed'", async () => {
    vi.mocked(replayEntityState).mockResolvedValue({
      entity: { type: ENTITY_TYPE, id: ENTITY_ID },
      current_state: {},
      steps: [],
      up_to_audit_id: null,
      event_count: 0,
      is_truncated: false
    });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID } };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("timeline.replay.viewed");
  });

  it("handles service error (500 with code)", async () => {
    vi.mocked(replayEntityState).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });

  it("returns 401 on authError", async () => {
    const req = { method: "GET", query: { entity_type: ENTITY_TYPE, entity_id: ENTITY_ID } };
    const ctx = { ...baseCtx, authError: { status: 401, code: "TOKEN_EXPIRED", message: "Token expired" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("TOKEN_EXPIRED");
  });
});
