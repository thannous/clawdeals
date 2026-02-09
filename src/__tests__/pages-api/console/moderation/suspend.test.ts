import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/moderation", () => ({
  suspendAgent: vi.fn(),
  suspendOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/console/moderation/suspend";
import { suspendAgent, suspendOwner } from "../../../../server/services/moderation";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

const UUID = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";

describe("POST /api/console/moderation/suspend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-POST methods", async () => {
    const req = { method: "GET", body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "POST", body: { target_type: "agent", target_id: UUID } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when authError present", async () => {
    const req = { method: "POST", body: { target_type: "agent", target_id: UUID } };
    const result: any = await handler(req, null, {
      ...baseCtx,
      authError: { status: 403, code: "FORBIDDEN", message: "No access" }
    });
    expect(result.status).toBe(403);
  });

  it("validates target_type enum", async () => {
    const req = { method: "POST", body: { target_type: "invalid", target_id: UUID } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toMatch(/target_type/);
  });

  it("validates target_id as UUID", async () => {
    const req = { method: "POST", body: { target_type: "agent", target_id: "not-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("suspends agent → calls suspendAgent", async () => {
    const suspended = { agentId: UUID, suspended_at: "2026-02-09T12:00:00Z" };
    vi.mocked(suspendAgent).mockResolvedValue(suspended);

    const req = { method: "POST", body: { target_type: "agent", target_id: UUID, reason: "abuse" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.result).toEqual(suspended);
    expect(suspendAgent).toHaveBeenCalledWith({
      agentId: UUID,
      reason: "abuse",
      performedBy: "owner-1"
    });
    expect(suspendOwner).not.toHaveBeenCalled();
  });

  it("suspends owner → calls suspendOwner", async () => {
    const suspended = { ownerId: UUID, suspended_at: "2026-02-09T12:00:00Z" };
    vi.mocked(suspendOwner).mockResolvedValue(suspended);

    const req = { method: "POST", body: { target_type: "owner", target_id: UUID, reason: "policy violation" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.result).toEqual(suspended);
    expect(suspendOwner).toHaveBeenCalledWith({
      ownerId: UUID,
      reason: "policy violation",
      performedBy: "owner-1"
    });
    expect(suspendAgent).not.toHaveBeenCalled();
  });

  it("sets ctx.auditEvent = 'moderation.suspended'", async () => {
    vi.mocked(suspendAgent).mockResolvedValue({ agentId: UUID, suspended_at: "2026-02-09T12:00:00Z" });
    const ctx = { ...baseCtx };
    const req = { method: "POST", body: { target_type: "agent", target_id: UUID } };
    await handler(req, null, ctx);
    expect(ctx.auditEvent).toBe("moderation.suspended");
  });

  it("handles service error (agent not found)", async () => {
    vi.mocked(suspendAgent).mockRejectedValue(
      Object.assign(new Error("Agent not found"), { status: 404, code: "NOT_FOUND" })
    );

    const req = { method: "POST", body: { target_type: "agent", target_id: UUID } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("handles unknown service error", async () => {
    vi.mocked(suspendOwner).mockRejectedValue(new Error("unexpected"));

    const req = { method: "POST", body: { target_type: "owner", target_id: UUID } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(500);
  });
});
