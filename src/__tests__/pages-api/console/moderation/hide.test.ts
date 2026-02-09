import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/moderation", () => ({
  hideEntity: vi.fn()
}));

import { handler } from "../../../../pages/api/console/moderation/hide";
import { hideEntity } from "../../../../server/services/moderation";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

const UUID = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";

describe("POST /api/console/moderation/hide", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-POST methods", async () => {
    const req = { method: "GET", body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "POST", body: { entity_type: "listing", entity_id: UUID } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates entity_type is required", async () => {
    const req = { method: "POST", body: { entity_id: UUID } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates entity_id as UUID", async () => {
    const req = { method: "POST", body: { entity_type: "listing", entity_id: "not-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("calls hideEntity and returns 200", async () => {
    const modState = { entity_type: "listing", entity_id: UUID, hidden: true };
    vi.mocked(hideEntity).mockResolvedValue(modState);

    const req = { method: "POST", body: { entity_type: "listing", entity_id: UUID, reason: "spam" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.moderation_state).toEqual(modState);
    expect(hideEntity).toHaveBeenCalledWith({
      entityType: "listing",
      entityId: UUID,
      reason: "spam",
      performedBy: "owner-1"
    });
  });

  it("sets ctx.auditEvent = 'moderation.entity_hidden'", async () => {
    vi.mocked(hideEntity).mockResolvedValue({});
    const ctx = { ...baseCtx };
    const req = { method: "POST", body: { entity_type: "listing", entity_id: UUID } };
    await handler(req, null, ctx);
    expect(ctx.auditEvent).toBe("moderation.entity_hidden");
  });

  it("handles service error", async () => {
    vi.mocked(hideEntity).mockRejectedValue(
      Object.assign(new Error("Not found"), { status: 404, code: "NOT_FOUND" })
    );

    const req = { method: "POST", body: { entity_type: "listing", entity_id: UUID } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("passes null reason when not provided", async () => {
    vi.mocked(hideEntity).mockResolvedValue({});
    const req = { method: "POST", body: { entity_type: "listing", entity_id: UUID } };
    await handler(req, null, { ...baseCtx });

    expect(hideEntity).toHaveBeenCalledWith(
      expect.objectContaining({ reason: null })
    );
  });
});
