import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/approvals", () => ({
  getApprovalForOwner: vi.fn(),
  resolveApproval: vi.fn()
}));

import { handler } from "./[id]";
import { getApprovalForOwner, resolveApproval } from "../../../../server/services/approvals";

const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const approvalId = "a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

function ownerCtx() {
  return { ownerId, actor: { type: "owner" }, authError: null };
}

function makeReq(idAction, body = {}, headers = {}) {
  return {
    method: "POST",
    headers: { "idempotency-key": "idem-1", ...headers },
    query: { id: idAction },
    body
  };
}

describe("POST /v1/approvals/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 405 for non-POST", async () => {
    const req = { method: "GET", headers: {}, query: { id: `${approvalId}:approve` } };
    const result = await handler(req, null, ownerCtx());
    expect(result.status).toBe(405);
  });

  it("returns 401 when actor is not owner", async () => {
    const result = await handler(
      makeReq(`${approvalId}:approve`),
      null,
      { actor: { type: "agent" }, authError: null }
    );
    expect(result.status).toBe(401);
  });

  it("returns 400 when approval_id is not a UUID", async () => {
    const result = await handler(makeReq("not-uuid:approve"), null, ownerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("UUID");
  });

  it("returns 400 without Idempotency-Key", async () => {
    const req = {
      method: "POST",
      headers: {},
      query: { id: `${approvalId}:approve` },
      body: {}
    };
    const result = await handler(req, null, ownerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("Idempotency-Key");
  });

  it("returns 404 when approval not found", async () => {
    getApprovalForOwner.mockResolvedValue(null);
    const result = await handler(makeReq(`${approvalId}:approve`), null, ownerCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 when already resolved with different decision", async () => {
    getApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "DENIED" });
    const result = await handler(makeReq(`${approvalId}:approve`), null, ownerCtx());
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("APPROVAL_ALREADY_RESOLVED");
  });

  it("returns 200 idempotently when same decision already applied", async () => {
    const existing = { approval_id: approvalId, state: "APPROVED" };
    getApprovalForOwner.mockResolvedValue(existing);
    const result = await handler(makeReq(`${approvalId}:approve`), null, ownerCtx());
    expect(result.status).toBe(200);
    expect(result.body.data.state).toBe("APPROVED");
  });

  it("returns 200 with state=APPROVED", async () => {
    getApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "PENDING" });
    resolveApproval.mockResolvedValue({ approval_id: approvalId, state: "APPROVED" });
    const ctx = ownerCtx();
    const result = await handler(makeReq(`${approvalId}:approve`), null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.state).toBe("APPROVED");
    expect(ctx.auditEvent).toBe("approval.resolved");
  });

  it("returns 200 with state=DENIED", async () => {
    getApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "PENDING" });
    resolveApproval.mockResolvedValue({ approval_id: approvalId, state: "DENIED" });
    const ctx = ownerCtx();
    const result = await handler(makeReq(`${approvalId}:deny`), null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.state).toBe("DENIED");
    expect(ctx.auditEvent).toBe("approval.resolved");
  });

  it("returns 404 for unknown action", async () => {
    const result = await handler(makeReq(`${approvalId}:cancel`), null, ownerCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("sets ctx.auditEvent and ctx.policy on resolve", async () => {
    getApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "PENDING" });
    resolveApproval.mockResolvedValue({ approval_id: approvalId, state: "APPROVED" });
    const ctx = ownerCtx();
    await handler(makeReq(`${approvalId}:approve`), null, ctx);
    expect(ctx.auditEvent).toBe("approval.resolved");
    expect(ctx.policy.approval_id).toBe(approvalId);
  });
});
