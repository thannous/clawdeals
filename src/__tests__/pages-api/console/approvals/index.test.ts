import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/approvals", () => ({
  listAllApprovals: vi.fn(),
  decodeApprovalCursor: vi.fn()
}));

import { handler } from "../../../../pages/api/console/approvals/index";
import { listAllApprovals, decodeApprovalCursor } from "../../../../server/services/approvals";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("GET /api/console/approvals", () => {
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

  it("returns items and next_cursor", async () => {
    vi.mocked(listAllApprovals).mockResolvedValue({
      approvals: [
        {
          approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
          state: "PENDING",
          action_type: "listing.create",
          created_at: "2026-02-05T12:00:00Z"
        }
      ],
      nextCursor: "cursor-abc"
    });

    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].approval_id).toBe("2b079372-0a7a-4fa1-93e0-1f269ea0f1d7");
    expect(result.body.next_cursor).toBe("cursor-abc");
  });

  it("defaults state to 'PENDING' when not provided", async () => {
    vi.mocked(listAllApprovals).mockResolvedValue({ approvals: [], nextCursor: null });

    const req = { method: "GET", query: {} };
    await handler(req, null, { ...baseCtx });

    expect(listAllApprovals).toHaveBeenCalledWith(expect.objectContaining({
      state: "PENDING"
    }));
  });

  it("passes filters (state, action_type, agent_id as createdByAgentId)", async () => {
    vi.mocked(listAllApprovals).mockResolvedValue({ approvals: [], nextCursor: null });

    const req = {
      method: "GET",
      query: {
        state: "APPROVED",
        action_type: "listing.create",
        agent_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7"
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(listAllApprovals).toHaveBeenCalledWith(expect.objectContaining({
      state: "APPROVED",
      actionType: "listing.create",
      createdByAgentId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7"
    }));
  });

  it("validates agent_id as UUID when provided (invalid → 400)", async () => {
    const req = { method: "GET", query: { agent_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates limit", async () => {
    const req = { method: "GET", query: { limit: "abc" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates cursor (decodeApprovalCursor error → 400)", async () => {
    vi.mocked(decodeApprovalCursor).mockReturnValue({ error: "Invalid cursor" } as any);

    const req = { method: "GET", query: { cursor: "bad-cursor" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sets ctx.auditEvent = 'approvals.listed'", async () => {
    vi.mocked(listAllApprovals).mockResolvedValue({ approvals: [], nextCursor: null });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: {} };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("approvals.listed");
  });

  it("handles service error", async () => {
    vi.mocked(listAllApprovals).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });
});
