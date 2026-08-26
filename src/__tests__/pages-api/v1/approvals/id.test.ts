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

  it("returns 405 for unsupported methods", async () => {
    const req = { method: "PUT", headers: {}, query: { id: `${approvalId}:approve` } };
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(405);
  });

  it("returns 401 when actor is not owner", async () => {
    const result: any = await handler(
      makeReq(`${approvalId}:approve`),
      null,
      { actor: { type: "agent" }, authError: null }
    );
    expect(result.status).toBe(401);
  });

  it("blocks agent actors even when an ownerId is present", async () => {
    const ctx: any = { ownerId, actor: { type: "agent" }, authError: null };
    const result: any = await handler(makeReq(`${approvalId}:approve`), null, ctx);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("HUMAN_APPROVAL_REQUIRED");
    expect(mockedGetApprovalForOwner).not.toHaveBeenCalled();
    expect(mockedResolveApproval).not.toHaveBeenCalled();
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

  it("returns 400 when approval_id is not a UUID", async () => {
    const result: any = await handler(makeReq("not-uuid:approve"), null, ownerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("UUID");
  });

  it("returns 400 without Idempotency-Key", async () => {
    const req = {
      method: "POST",
      headers: { host: "app.clawdeals.com", origin: "https://app.clawdeals.com" },
      query: { id: `${approvalId}:approve` },
      body: {}
    };
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("Idempotency-Key");
  });

  it("returns 404 when approval not found", async () => {
    mockedGetApprovalForOwner.mockResolvedValue(null as any);
    const result: any = await handler(makeReq(`${approvalId}:approve`), null, ownerCtx());
    expect(result.status).toBe(404);
    expect((result.body as any).error.code).toBe("NOT_FOUND");
  });

  it("returns 409 when already resolved with different decision", async () => {
    mockedGetApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "DENIED" } as any);
    const result: any = await handler(makeReq(`${approvalId}:approve`), null, ownerCtx());
    expect(result.status).toBe(409);
    expect((result.body as any).error.code).toBe("APPROVAL_ALREADY_RESOLVED");
  });

  it("returns 200 idempotently when same decision already applied", async () => {
    const existing = { approval_id: approvalId, state: "APPROVED" };
    mockedGetApprovalForOwner.mockResolvedValue(existing as any);
    const result: any = await handler(makeReq(`${approvalId}:approve`), null, ownerCtx());
    expect(result.status).toBe(200);
    expect((result.body as any).data.state).toBe("APPROVED");
    expect(mockedResolveApproval).not.toHaveBeenCalled();
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

  it("returns 200 with state=APPROVED", async () => {
    mockedGetApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "PENDING" } as any);
    mockedResolveApproval.mockResolvedValue({ approval_id: approvalId, state: "APPROVED" } as any);
    const ctx = ownerCtx();
    const result: any = await handler(makeReq(`${approvalId}:approve`), null, ctx);
    expect(result.status).toBe(200);
    expect((result.body as any).data.state).toBe("APPROVED");
    expect(ctx.auditEvent).toBe("approval.resolved");
    expect(mockedSafeAuditLog).not.toHaveBeenCalled();
  });

  it("returns 200 with state=DENIED", async () => {
    mockedGetApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "PENDING" } as any);
    mockedResolveApproval.mockResolvedValue({ approval_id: approvalId, state: "DENIED" } as any);
    const ctx = ownerCtx();
    const result: any = await handler(makeReq(`${approvalId}:deny`), null, ctx);
    expect(result.status).toBe(200);
    expect((result.body as any).data.state).toBe("DENIED");
    expect(ctx.auditEvent).toBe("approval.resolved");
  });

  it("records one owner consent without revealing contacts", async () => {
    const existing = {
      approval_id: approvalId,
      owner_id: ownerId,
      state: "PENDING",
      action_type: "contact_reveal_consent",
      action_ref: { tx_id: "11111111-1111-4111-8111-111111111111", party_role: "BUYER" }
    };
    mockedGetApprovalForOwner.mockResolvedValue(existing as any);
    mockedResolveApproval.mockResolvedValue({
      ...existing,
      state: "APPROVED",
      tx_id: existing.action_ref.tx_id,
      contact_reveal_state: "REQUESTED",
      became_revealed: false
    } as any);
    mockedGetTransaction.mockResolvedValue({
      tx_id: existing.action_ref.tx_id,
      listing_id: "22222222-2222-4222-8222-222222222222",
      buyer_agent_id: "33333333-3333-4333-8333-333333333333",
      seller_agent_id: "44444444-4444-4444-8444-444444444444"
    } as any);
    const ctx: any = ownerCtx();

    const result: any = await handler(makeReq(`${approvalId}:approve`), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      state: "APPROVED",
      contact_reveal_state: "REQUESTED",
      became_revealed: false
    });
    expect(result.body.data).not.toHaveProperty("buyer_contact");
    expect(result.body.data).not.toHaveProperty("seller_contact");
    expect(ctx.auditEvent).toBe("contact_reveal.consent_approved");
    expect(mockedPublishSseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "contact_reveal.consent_approved",
        payload: expect.not.objectContaining({ email: expect.anything(), phone: expect.anything() })
      })
    );
  });

  it("allows pre-final consent revocation and maps it to CANCELLED", async () => {
    const existing = {
      approval_id: approvalId,
      owner_id: ownerId,
      state: "APPROVED",
      action_type: "contact_reveal_consent",
      action_ref: { tx_id: "11111111-1111-4111-8111-111111111111", party_role: "SELLER" }
    };
    mockedGetApprovalForOwner.mockResolvedValue(existing as any);
    mockedResolveApproval.mockResolvedValue({
      ...existing,
      state: "CANCELLED",
      tx_id: existing.action_ref.tx_id,
      contact_reveal_state: "DENIED",
      became_revealed: false
    } as any);
    mockedGetTransaction.mockResolvedValue({
      tx_id: existing.action_ref.tx_id,
      listing_id: "22222222-2222-4222-8222-222222222222",
      buyer_agent_id: "33333333-3333-4333-8333-333333333333",
      seller_agent_id: "44444444-4444-4444-8444-444444444444"
    } as any);
    const ctx: any = ownerCtx();

    const result: any = await handler(makeReq(`${approvalId}:revoke`), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.data.state).toBe("CANCELLED");
    expect(mockedResolveApproval).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "REVOKED", ownerId })
    );
    expect(ctx.auditEvent).toBe("contact_reveal.consent_revoked");
  });

  it("returns 404 for unknown action", async () => {
    const result: any = await handler(makeReq(`${approvalId}:cancel`), null, ownerCtx());
    expect(result.status).toBe(404);
    expect((result.body as any).error.code).toBe("NOT_FOUND");
  });

  it("passes note through as resolveApproval reason", async () => {
    mockedGetApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "PENDING" } as any);
    mockedResolveApproval.mockResolvedValue({ approval_id: approvalId, state: "APPROVED" } as any);

    const result: any = await handler(makeReq(`${approvalId}:approve`, { note: "looks good" }), null, ownerCtx());
    expect(result.status).toBe(200);
    expect(resolveApproval).toHaveBeenCalledWith(expect.objectContaining({ reason: "looks good" }));
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

  it("revalidates and resolves an edited mission-bound counteroffer", async () => {
    const existing: any = {
      approval_id: approvalId,
      owner_id: ownerId,
      state: "PENDING",
      action_type: "offer_over_budget",
      action_ref: { mission_id: "b2cb3c39-7e2f-4c2d-9d0b-53b77339b8de", amount: 1350 },
      action_payload_redacted: { offer: { amount: 1350, currency: "EUR" } }
    };
    const edited = {
      ...existing,
      action_ref: { ...existing.action_ref, amount: 1290 },
      action_payload_redacted: { offer: { amount: 1290, currency: "EUR" } }
    };
    mockedGetApprovalForOwner.mockResolvedValue(existing);
    mockedEditPendingMissionOfferApproval.mockResolvedValue({
      approval: edited,
      mission: { hard_budget_max: 1300 },
      policyDecision: { decision: "ALLOW", policy_version: 3 }
    } as any);
    mockedResolveApproval.mockResolvedValue({ ...edited, state: "APPROVED" } as any);
    const ctx: any = ownerCtx();

    const result: any = await handler(
      makeReq(`${approvalId}:approve`, { amount: 1290 }),
      null,
      ctx
    );

    expect(result.status).toBe(200);
    expect(mockedEditPendingMissionOfferApproval).toHaveBeenCalledWith({
      approval: existing,
      ownerId,
      amount: 1290
    });
    expect(mockedResolveApproval).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId, ownerId, decision: "APPROVED" })
    );
    expect(ctx.policy).toMatchObject({ decision: "ALLOW", policy_version: 3 });
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

  it("sets ctx.auditEvent and ctx.policy on resolve", async () => {
    mockedGetApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "PENDING" } as any);
    mockedResolveApproval.mockResolvedValue({ approval_id: approvalId, state: "APPROVED" } as any);
    const ctx = ownerCtx();
    await handler(makeReq(`${approvalId}:approve`), null, ctx);
    expect(ctx.auditEvent).toBe("approval.resolved");
    expect(ctx.policy?.approval_id).toBe(approvalId);
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

describe("GET /v1/approvals/[id] (detail)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when approval_id is not a UUID", async () => {
    const req: any = { method: "GET", headers: {}, query: { id: "not-uuid" } };
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when approval not found", async () => {
    mockedGetApprovalForOwner.mockResolvedValue(null as any);
    const req: any = { method: "GET", headers: {}, query: { id: approvalId } };
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 200 with approval data", async () => {
    mockedGetApprovalForOwner.mockResolvedValue({ approval_id: approvalId, state: "PENDING" } as any);
    const ctx: any = ownerCtx();
    const req: any = { method: "GET", headers: {}, query: { id: approvalId } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.approval_id).toBe(approvalId);
    expect(ctx.auditEvent).toBe("approval.viewed");
  });

  it("adds aggregate contact state without adding PII", async () => {
    mockedGetApprovalForOwner.mockResolvedValue({
      approval_id: approvalId,
      state: "PENDING",
      action_type: "contact_reveal_consent",
      action_ref_id: "11111111-1111-4111-8111-111111111111",
      action_ref: { tx_id: "11111111-1111-4111-8111-111111111111", party_role: "BUYER" }
    } as any);
    mockedGetTransaction.mockResolvedValue({
      contact_reveal_state: "REQUESTED",
      status: "ACCEPTED"
    } as any);

    const result: any = await handler(
      { method: "GET", headers: {}, query: { id: approvalId } },
      null,
      ownerCtx()
    );

    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({
      contact_reveal_state: "REQUESTED",
      tx_status: "ACCEPTED"
    });
    expect(JSON.stringify(result.body.data)).not.toMatch(/email|phone/i);
  });
});
