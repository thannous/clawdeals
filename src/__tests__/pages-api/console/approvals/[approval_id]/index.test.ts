import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/approvals", () => ({
  getApproval: vi.fn(),
  resolveApproval: vi.fn()
}));

import { handler } from "../../../../../pages/api/console/approvals/[approval_id]/index";
import { getApproval, resolveApproval } from "../../../../../server/services/approvals";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("/api/console/approvals/[approval_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-GET/POST methods", async () => {
    const req = { method: "DELETE", query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "GET", query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  // --- GET tests ---

  it("GET: validates approval_id as UUID", async () => {
    const req = { method: "GET", query: { approval_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET: returns approval on success (200)", async () => {
    const approval = {
      approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      state: "PENDING",
      action_type: "listing.create",
      owner_id: "owner-1"
    };
    vi.mocked(getApproval).mockResolvedValue(approval);

    const req = { method: "GET", query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.approval).toEqual(approval);
  });

  it("GET: returns 404 when null", async () => {
    vi.mocked(getApproval).mockResolvedValue(null);

    const req = { method: "GET", query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("GET: sets ctx.auditEvent = 'approval.viewed'", async () => {
    vi.mocked(getApproval).mockResolvedValue({ approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("approval.viewed");
  });

  // --- POST tests ---

  it("POST: validates action (must be 'approve' or 'deny') → 400", async () => {
    const req = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "invalid" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST: approve → calls resolveApproval with decision 'APPROVED', returns 200", async () => {
    const approval = {
      approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      state: "PENDING",
      owner_id: "owner-1"
    };
    const resolved = { ...approval, state: "APPROVED" };

    vi.mocked(getApproval).mockResolvedValue(approval);
    vi.mocked(resolveApproval).mockResolvedValue(resolved);

    const req = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "approve" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.approval).toEqual(resolved);
    expect(resolveApproval).toHaveBeenCalledWith({
      approvalId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      ownerId: "owner-1",
      decision: "APPROVED",
      resolvedBy: "owner-1",
      reason: undefined
    });
  });

  it("POST: deny → calls resolveApproval with decision 'DENIED', returns 200", async () => {
    const approval = {
      approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      state: "PENDING",
      owner_id: "owner-1"
    };
    const resolved = { ...approval, state: "DENIED" };

    vi.mocked(getApproval).mockResolvedValue(approval);
    vi.mocked(resolveApproval).mockResolvedValue(resolved);

    const req = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "deny" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.approval).toEqual(resolved);
    expect(resolveApproval).toHaveBeenCalledWith({
      approvalId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      ownerId: "owner-1",
      decision: "DENIED",
      resolvedBy: "owner-1",
      reason: undefined
    });
  });

  it("POST: deny with reason → passes reason to resolveApproval", async () => {
    const approval = {
      approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      state: "PENDING",
      owner_id: "owner-1"
    };
    vi.mocked(getApproval).mockResolvedValue(approval);
    vi.mocked(resolveApproval).mockResolvedValue({ ...approval, state: "DENIED" });

    const req = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "deny", reason: "Violates policy" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(resolveApproval).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Violates policy" })
    );
  });

  it("POST: reason is truncated at 500 chars", async () => {
    const approval = {
      approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      state: "PENDING",
      owner_id: "owner-1"
    };
    vi.mocked(getApproval).mockResolvedValue(approval);
    vi.mocked(resolveApproval).mockResolvedValue({ ...approval, state: "DENIED" });

    const longReason = "x".repeat(600);
    const req = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "deny", reason: longReason }
    };
    await handler(req, null, { ...baseCtx });

    const call = vi.mocked(resolveApproval).mock.calls[0][0] as any;
    expect(call.reason).toHaveLength(500);
  });

  it("POST: returns 409 when approval.state !== 'PENDING'", async () => {
    const approval = {
      approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      state: "APPROVED",
      action_type: "listing_publish",
      owner_id: "owner-1"
    };
    vi.mocked(getApproval).mockResolvedValue(approval);

    const req = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "approve" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("CONFLICT");
  });

  it("POST: replays escrow confirm-received side effects when already APPROVED", async () => {
    const approval = {
      approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      state: "APPROVED",
      action_type: "escrow.confirm_received",
      owner_id: "owner-1"
    };
    vi.mocked(getApproval).mockResolvedValue(approval);
    vi.mocked(resolveApproval).mockResolvedValue(approval as any);

    const req = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "approve" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(resolveApproval).toHaveBeenCalledWith({
      approvalId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      ownerId: "owner-1",
      decision: "APPROVED",
      resolvedBy: "owner-1",
      reason: undefined
    });
  });

  it("POST: returns 404 when getApproval returns null", async () => {
    vi.mocked(getApproval).mockResolvedValue(null);

    const req = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "approve" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("POST: sets ctx.auditEvent = 'approval.resolved'", async () => {
    const approval = {
      approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      state: "PENDING",
      owner_id: "owner-1"
    };
    vi.mocked(getApproval).mockResolvedValue(approval);
    vi.mocked(resolveApproval).mockResolvedValue({ ...approval, state: "APPROVED" });

    const ctx = { ...baseCtx };
    const req = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "approve" }
    };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("approval.resolved");
  });

  it("POST/GET: handles service error", async () => {
    vi.mocked(getApproval).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    // GET error
    const reqGet = { method: "GET", query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const resultGet: any = await handler(reqGet, null, { ...baseCtx });
    expect(resultGet.status).toBe(500);
    expect(resultGet.body.error.code).toBe("DB_ERROR");

    // POST error
    vi.mocked(getApproval).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );
    const reqPost = {
      method: "POST",
      query: { approval_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "approve" }
    };
    const resultPost: any = await handler(reqPost, null, { ...baseCtx });
    expect(resultPost.status).toBe(500);
    expect(resultPost.body.error.code).toBe("DB_ERROR");
  });
});
