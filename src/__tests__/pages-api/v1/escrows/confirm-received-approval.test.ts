import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/psp-config", () => ({
  getPspConfig: vi.fn()
}));

vi.mock("../../../../server/psp", () => ({
  createPspAdapter: vi.fn()
}));

vi.mock("../../../../server/services/escrows", () => ({
  getEscrowById: vi.fn(),
  markEscrowConfirmed: vi.fn(),
  setEscrowReleasePending: vi.fn()
}));

vi.mock("../../../../server/services/approvals", () => ({
  upsertPendingApproval: vi.fn()
}));

vi.mock("../../../../server/services/psp-webhook-events", () => ({
  claimOrphanedPspWebhookEvents: vi.fn().mockResolvedValue(0)
}));

vi.mock("../../../../server/services/psp-webhook-replay", () => ({
  replayPendingEscrowEvents: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../../../server/sse/store", () => ({
  publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
}));

import { handler } from "../../../../pages/api/v1/escrows/[escrow_id]/confirm-received";
import { getPspConfig } from "../../../../server/services/psp-config";
import { createPspAdapter } from "../../../../server/psp";
import { getEscrowById, markEscrowConfirmed, setEscrowReleasePending } from "../../../../server/services/escrows";
import { upsertPendingApproval } from "../../../../server/services/approvals";

const getPspConfigMock = vi.mocked(getPspConfig);
const createPspAdapterMock = vi.mocked(createPspAdapter);
const getEscrowByIdMock = vi.mocked(getEscrowById);
const markEscrowConfirmedMock = vi.mocked(markEscrowConfirmed);
const setEscrowReleasePendingMock = vi.mocked(setEscrowReleasePending);
const upsertPendingApprovalMock = vi.mocked(upsertPendingApproval);

const escrowId = "11111111-1111-4111-8111-111111111111";
const buyerAgentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const installationId = "33333333-3333-4333-8333-333333333333";

describe("POST /v1/escrows/:escrow_id/confirm-received", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPspConfigMock.mockResolvedValue({
      provider: "mock",
      mode: "sandbox"
    } as any);
    getEscrowByIdMock.mockResolvedValue({
      escrow_id: escrowId,
      tx_id: "22222222-2222-4222-8222-222222222222",
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "DELIVERED",
      psp_payment_id: "pay_1",
      amount_gross_minor: 1000,
      currency: "EUR"
    } as any);
    upsertPendingApprovalMock.mockResolvedValue({
      approval_id: "appr-1"
    } as any);
    markEscrowConfirmedMock.mockResolvedValue({
      escrow_id: escrowId,
      confirmed_at: "2026-02-11T10:00:00.000Z"
    } as any);
    setEscrowReleasePendingMock.mockResolvedValue({
      escrow_id: escrowId,
      status: "RELEASE_PENDING",
      psp_payout_id: "po_1",
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId
    } as any);
    createPspAdapterMock.mockReturnValue({
      release: vi.fn().mockResolvedValue({ payoutId: "po_1" })
    } as any);
  });

  it("returns 202 + approval_id for installation-scoped credentials", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { escrow_id: escrowId },
      body: {}
    };
    const ctx: any = {
      authError: null,
      agentId: buyerAgentId,
      ownerId,
      installationId,
      actor: { type: "agent", id: buyerAgentId }
    };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(202);
    expect(result.body.status).toBe("PENDING_APPROVAL");
    expect(result.body.approval_id).toBe("appr-1");
    expect(upsertPendingApprovalMock).toHaveBeenCalledTimes(1);
    expect(markEscrowConfirmedMock).not.toHaveBeenCalled();
  });

  it("keeps existing behavior for non-installation credentials", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { escrow_id: escrowId },
      body: {}
    };
    const ctx: any = {
      authError: null,
      agentId: buyerAgentId,
      ownerId,
      installationId: null,
      actor: { type: "agent", id: buyerAgentId }
    };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.escrow_id).toBe(escrowId);
    expect(markEscrowConfirmedMock).toHaveBeenCalledTimes(1);
    expect(upsertPendingApprovalMock).not.toHaveBeenCalled();
  });
});

