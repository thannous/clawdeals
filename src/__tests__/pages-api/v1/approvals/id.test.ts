import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/approvals", () => ({
  editPendingMissionOfferApproval: vi.fn(),
  getApprovalForOwner: vi.fn(),
  resolveApproval: vi.fn()
}));

vi.mock("../../../../server/audit/singleton", () => ({
  safeAuditLog: vi.fn().mockResolvedValue(null)
}));

vi.mock("../../../../server/services/transactions", () => ({
  getTransaction: vi.fn()
}));

vi.mock("../../../../server/sse/store", () => ({
  publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
}));

import { handler } from "../../../../pages/api/v1/approvals/[id]";
import {
  editPendingMissionOfferApproval,
  getApprovalForOwner,
  resolveApproval
} from "../../../../server/services/approvals";
import { safeAuditLog } from "../../../../server/audit/singleton";
import { getTransaction } from "../../../../server/services/transactions";
import { publishSseEvent } from "../../../../server/sse/store";

const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const approvalId = "a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

const mockedGetApprovalForOwner = vi.mocked(getApprovalForOwner);
const mockedResolveApproval = vi.mocked(resolveApproval);
const mockedEditPendingMissionOfferApproval = vi.mocked(editPendingMissionOfferApproval);
const mockedSafeAuditLog = vi.mocked(safeAuditLog);
const mockedGetTransaction = vi.mocked(getTransaction);
const mockedPublishSseEvent = vi.mocked(publishSseEvent);

type OwnerCtx = {
  ownerId: string | null;
  actor: { type: "owner" };
  ownerSessionId: string;
  authError: null;
  auditEvent?: string;
  policy?: { approval_id: string };
};

function ownerCtx() {
  return {
    ownerId,
    actor: { type: "owner" },
    ownerSessionId: "d1cb3c39-7e2f-4c2d-9d0b-53b77339b8de",
    authError: null
  } as OwnerCtx;
}

function makeReq(idAction, body = {}, headers = {}) {
  return {
    method: "POST",
    headers: {
      host: "app.clawdeals.com",
      origin: "https://app.clawdeals.com",
      "idempotency-key": "idem-1",
      ...headers
    },
    query: { id: idAction },
    body
  };
}

describe("POST /v1/approvals/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks owner actors without an authenticated owner session", async () => {
    const ctx: any = { ownerId, actor: { type: "owner" }, ownerSessionId: null, authError: null };
    const result: any = await handler(makeReq(`${approvalId}:deny`), null, ctx);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("HUMAN_APPROVAL_REQUIRED");
    expect(mockedResolveApproval).not.toHaveBeenCalled();
  });

  it("blocks an owner-session mutation without Origin or Referer", async () => {
    const result: any = await handler(
      makeReq(`${approvalId}:approve`, {}, { origin: undefined }),
      null,
      ownerCtx()
    );
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("CSRF_BLOCKED");
    expect(mockedGetApprovalForOwner).not.toHaveBeenCalled();
  });

  it("blocks an owner-session mutation from a foreign Origin", async () => {
    const result: any = await handler(
      makeReq(`${approvalId}:approve`, {}, { origin: "https://evil.example" }),
      null,
      ownerCtx()
    );
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("CSRF_BLOCKED");
    expect(mockedGetApprovalForOwner).not.toHaveBeenCalled();
  });

  it("accepts a same-origin Referer when Origin is absent", async () => {
    mockedGetApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "PENDING" } as any);
    mockedResolveApproval.mockResolvedValue({ approval_id: approvalId, state: "APPROVED" } as any);
    const result: any = await handler(
      makeReq(`${approvalId}:approve`, {}, {
        origin: undefined,
        referer: "https://app.clawdeals.com/my/approvals"
      }),
      null,
      ownerCtx()
    );
    expect(result.status).toBe(200);
    expect(mockedResolveApproval).toHaveBeenCalledTimes(1);
  });

  it("replays escrow confirm-received side effects when already APPROVED", async () => {
    const existing = { approval_id: approvalId, state: "APPROVED", action_type: "escrow.confirm_received" };
    mockedGetApprovalForOwner.mockResolvedValue(existing as any);
    mockedResolveApproval.mockResolvedValue(existing as any);
    const ctx = ownerCtx();

    const result: any = await handler(makeReq(`${approvalId}:approve`), null, ctx);

    expect(result.status).toBe(200);
    expect(mockedResolveApproval).toHaveBeenCalledWith({
      approvalId,
      ownerId,
      decision: "APPROVED",
      resolvedBy: ownerId,
      reason: null
    });
    expect(ctx.auditEvent).toBe("approval.resolved");
    expect(ctx.policy?.approval_id).toBe(approvalId);
  });

  it("rejects invalid edited amounts before loading the approval", async () => {
    const result: any = await handler(
      makeReq(`${approvalId}:approve`, { amount: 12.5 }),
      null,
      ownerCtx()
    );
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedGetApprovalForOwner).not.toHaveBeenCalled();
  });

  it("rejects amount edits on approvals that are not mission-bound offers", async () => {
    mockedGetApprovalForOwner.mockResolvedValue({
      approval_id: approvalId,
      owner_id: ownerId,
      state: "PENDING",
      action_type: "thread.create",
      action_ref: {}
    } as any);

    const result: any = await handler(
      makeReq(`${approvalId}:approve`, { amount: 1290 }),
      null,
      ownerCtx()
    );
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedResolveApproval).not.toHaveBeenCalled();
  });

  it("allows the owner to explicitly approve an unchanged amount above the agent cap", async () => {
    const existing: any = {
      approval_id: approvalId,
      owner_id: ownerId,
      state: "PENDING",
      action_type: "offer_over_budget",
      action_ref: { mission_id: "b2cb3c39-7e2f-4c2d-9d0b-53b77339b8de", amount: 1350 },
      action_payload_redacted: { offer: { amount: 1350, currency: "EUR" } }
    };
    mockedGetApprovalForOwner.mockResolvedValue(existing);
    mockedEditPendingMissionOfferApproval.mockResolvedValue({
      approval: existing,
      mission: { hard_budget_max: 1300 },
      policyDecision: { decision: "REQUIRES_APPROVAL", policy_version: 3 }
    } as any);
    mockedResolveApproval.mockResolvedValue({ ...existing, state: "APPROVED" } as any);

    const result: any = await handler(makeReq(`${approvalId}:approve`), null, ownerCtx());
    expect(result.status).toBe(200);
    expect(mockedEditPendingMissionOfferApproval).toHaveBeenCalledWith({
      approval: existing,
      ownerId,
      amount: 1350
    });
    expect(mockedResolveApproval).toHaveBeenCalledTimes(1);
  });

  it("returns a stable conflict when the pending approval changes before resolution", async () => {
    const existing: any = {
      approval_id: approvalId,
      owner_id: ownerId,
      state: "PENDING",
      action_type: "offer_over_budget",
      action_ref: { mission_id: "b2cb3c39-7e2f-4c2d-9d0b-53b77339b8de", amount: 1350 },
      action_payload_redacted: { offer: { amount: 1350, currency: "EUR" } }
    };
    mockedGetApprovalForOwner.mockResolvedValue(existing);
    mockedEditPendingMissionOfferApproval.mockRejectedValue(
      Object.assign(new Error("Approval changed while it was being edited"), {
        status: 409,
        code: "APPROVAL_STALE"
      })
    );

    const result: any = await handler(
      makeReq(`${approvalId}:approve`, { amount: 1290 }),
      null,
      ownerCtx()
    );
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("APPROVAL_STALE");
    expect(mockedResolveApproval).not.toHaveBeenCalled();
  });

  it("writes an additional message.redacted audit event when approving a redacted message", async () => {
    mockedGetApprovalForOwner.mockResolvedValue({
      approval_id: approvalId,
      state: "PENDING",
      action_type: "message.send",
      action_ref: { thread_id: "t1", message_type: "question", message_redacted: true, original_hmac: "abc", redaction_reason: "external_link" }
    } as any);
    mockedResolveApproval.mockResolvedValue({ approval_id: approvalId, state: "APPROVED" } as any);

    const ctx: any = ownerCtx();
    const result: any = await handler(makeReq(`${approvalId}:approve`), null, ctx);
    expect(result.status).toBe(200);
    expect(mockedSafeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ event: "message.redacted" }),
        payload: expect.objectContaining({ approval_id: approvalId, thread_id: "t1", message_type: "question" })
      })
    );
  });
});
