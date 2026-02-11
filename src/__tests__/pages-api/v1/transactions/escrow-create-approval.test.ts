import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/psp-config", () => ({
  getPspConfig: vi.fn()
}));

vi.mock("../../../../server/services/psp-accounts", () => ({
  getPspAccountForOwner: vi.fn()
}));

vi.mock("../../../../server/services/transactions", () => ({
  getTransaction: vi.fn()
}));

vi.mock("../../../../server/services/agents", () => ({
  getAgentById: vi.fn()
}));

vi.mock("../../../../server/services/escrows", () => ({
  createEscrow: vi.fn(),
  getEscrowByTxId: vi.fn()
}));

vi.mock("../../../../server/services/approvals", () => ({
  upsertPendingApproval: vi.fn()
}));

vi.mock("../../../../server/sse/store", () => ({
  publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
}));

import { handler } from "../../../../pages/api/v1/transactions/[tx_id]/[action]";
import { getPspConfig } from "../../../../server/services/psp-config";
import { getTransaction } from "../../../../server/services/transactions";
import { createEscrow, getEscrowByTxId } from "../../../../server/services/escrows";
import { upsertPendingApproval } from "../../../../server/services/approvals";

const getPspConfigMock = vi.mocked(getPspConfig);
const getTransactionMock = vi.mocked(getTransaction);
const createEscrowMock = vi.mocked(createEscrow);
const getEscrowByTxIdMock = vi.mocked(getEscrowByTxId);
const upsertPendingApprovalMock = vi.mocked(upsertPendingApproval);

const txId = "11111111-1111-4111-8111-111111111111";
const buyerAgentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const installationId = "33333333-3333-4333-8333-333333333333";

describe("POST /v1/transactions/:tx_id/escrow:create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPspConfigMock.mockResolvedValue({
      provider: "mock",
      mode: "sandbox",
      platform_fee_bps_default: 400
    } as any);
    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      listing_id: "22222222-2222-4222-8222-222222222222",
      thread_id: "44444444-4444-4444-8444-444444444444",
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "ACCEPTED"
    } as any);
    getEscrowByTxIdMock.mockResolvedValue(null as any);
    upsertPendingApprovalMock.mockResolvedValue({
      approval_id: "appr-1"
    } as any);
    createEscrowMock.mockResolvedValue({
      escrow_id: "55555555-5555-4555-8555-555555555555",
      tx_id: txId,
      status: "CREATED",
      currency: "EUR",
      amount_gross_minor: 1000,
      platform_fee_bps: 400,
      amount_platform_fee_minor: 40,
      amount_net_minor: 960,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId
    } as any);
  });

  it("returns 202 + approval_id for installation-scoped credentials", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId, action: "escrow:create" },
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
    expect(createEscrowMock).not.toHaveBeenCalled();
  });

  it("keeps existing behavior for non-installation credentials", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId, action: "escrow:create" },
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
    expect(result.status).toBe(201);
    expect(result.body.escrow_id).toBe("55555555-5555-4555-8555-555555555555");
    expect(createEscrowMock).toHaveBeenCalledTimes(1);
    expect(upsertPendingApprovalMock).not.toHaveBeenCalled();
  });
});

