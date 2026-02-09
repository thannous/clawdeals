import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/approvals", () => ({
  bulkResolveApprovals: vi.fn()
}));

import { handler } from "../../../../pages/api/console/approvals/bulk";
import { bulkResolveApprovals } from "../../../../server/services/approvals";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

const UUID_A = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";
const UUID_B = "3c089482-1b8b-5fb2-a4f1-2f379fb1f2e8";

describe("POST /api/console/approvals/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-POST methods", async () => {
    const req = { method: "GET", body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "POST", body: { approval_ids: [UUID_A], action: "approve" } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when authError present", async () => {
    const req = { method: "POST", body: { approval_ids: [UUID_A], action: "approve" } };
    const result: any = await handler(req, null, {
      ...baseCtx,
      authError: { status: 403, code: "FORBIDDEN", message: "No access" }
    });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("FORBIDDEN");
  });

  it("validates action enum", async () => {
    const req = { method: "POST", body: { approval_ids: [UUID_A], action: "invalid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toMatch(/approve.*deny/);
  });

  it("validates approval_ids is non-empty array", async () => {
    const req = { method: "POST", body: { approval_ids: [], action: "approve" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates approval_ids not an array", async () => {
    const req = { method: "POST", body: { approval_ids: "not-array", action: "approve" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates each UUID in approval_ids", async () => {
    const req = { method: "POST", body: { approval_ids: [UUID_A, "not-uuid"], action: "approve" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toMatch(/not-uuid/);
  });

  it("approve → calls bulkResolveApprovals with APPROVED", async () => {
    const resolved = { resolved: [UUID_A, UUID_B], errors: [] };
    vi.mocked(bulkResolveApprovals).mockResolvedValue(resolved);

    const req = { method: "POST", body: { approval_ids: [UUID_A, UUID_B], action: "approve" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body).toEqual(resolved);
    expect(bulkResolveApprovals).toHaveBeenCalledWith({
      approvalIds: [UUID_A, UUID_B],
      decision: "APPROVED",
      resolvedBy: "owner-1",
      reason: undefined
    });
  });

  it("deny → calls bulkResolveApprovals with DENIED", async () => {
    vi.mocked(bulkResolveApprovals).mockResolvedValue({ resolved: [UUID_A], errors: [] });

    const req = { method: "POST", body: { approval_ids: [UUID_A], action: "deny", reason: "spam" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(bulkResolveApprovals).toHaveBeenCalledWith({
      approvalIds: [UUID_A],
      decision: "DENIED",
      resolvedBy: "owner-1",
      reason: "spam"
    });
  });

  it("truncates reason at 500 chars", async () => {
    vi.mocked(bulkResolveApprovals).mockResolvedValue({ resolved: [UUID_A], errors: [] });

    const longReason = "x".repeat(600);
    const req = { method: "POST", body: { approval_ids: [UUID_A], action: "deny", reason: longReason } };
    await handler(req, null, { ...baseCtx });

    const call = vi.mocked(bulkResolveApprovals).mock.calls[0][0] as any;
    expect(call.reason).toHaveLength(500);
  });

  it("sets ctx.auditEvent = 'approvals.bulk_resolved'", async () => {
    vi.mocked(bulkResolveApprovals).mockResolvedValue({ resolved: [], errors: [] });

    const ctx = { ...baseCtx };
    const req = { method: "POST", body: { approval_ids: [UUID_A], action: "approve" } };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("approvals.bulk_resolved");
  });

  it("handles service error", async () => {
    vi.mocked(bulkResolveApprovals).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "POST", body: { approval_ids: [UUID_A], action: "approve" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });
});
