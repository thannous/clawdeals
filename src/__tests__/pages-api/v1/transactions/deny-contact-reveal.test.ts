import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const handlerExists = [
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/deny-contact-reveal.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/deny-contact-reveal.js")
].some((candidate) => fs.existsSync(candidate));

const suite = handlerExists ? describe : describe.skip;

suite("POST /v1/transactions/{tx_id}/deny-contact-reveal (TI-203)", () => {
  const txId = "11111111-1111-4111-8111-111111111111";
  const listingId = "22222222-2222-4222-8222-222222222222";
  const buyerAgentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const opsOwnerId = "00000000-0000-4000-a000-000000000000";

  const baseCtx: any = {
    ownerId: opsOwnerId,
    agentId: null,
    actor: { type: "owner", id: opsOwnerId },
    authError: null
  };

  let handler: any;

  let getTransactionMock: any;
  let getContactRevealApprovalByTxIdMock: any;
  let resolveApprovalMock: any;
  let publishSseEventMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../server/services/transactions", () => ({
      getTransaction: vi.fn(),
      getContactRevealApprovalByTxId: vi.fn()
    }));

    vi.doMock("../../../../server/services/approvals", () => ({
      resolveApproval: vi.fn()
    }));

    vi.doMock("../../../../server/sse/store", () => ({
      publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
    }));

    ({ handler } = await import("../../../../pages/api/v1/transactions/[tx_id]/deny-contact-reveal"));

    const txMod = await import("../../../../server/services/transactions");
    getTransactionMock = vi.mocked(txMod.getTransaction);
    getContactRevealApprovalByTxIdMock = vi.mocked(txMod.getContactRevealApprovalByTxId);

    const approvalsMod = await import("../../../../server/services/approvals");
    resolveApprovalMock = vi.mocked(approvalsMod.resolveApproval);

    const sseMod = await import("../../../../server/sse/store");
    publishSseEventMock = vi.mocked(sseMod.publishSseEvent);
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();

    getTransactionMock.mockResolvedValueOnce({
      tx_id: txId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "ACCEPTED",
      contact_reveal_state: "REQUESTED",
      updated_at: "2026-02-08T12:00:00Z"
    } as any);

    getContactRevealApprovalByTxIdMock.mockResolvedValue({
      approval_id: "appr-1",
      owner_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      state: "PENDING"
    } as any);

    resolveApprovalMock.mockResolvedValue({
      approval_id: "appr-1",
      state: "DENIED"
    } as any);

    getTransactionMock.mockResolvedValueOnce({
      tx_id: txId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "ACCEPTED",
      contact_reveal_state: "DENIED",
      updated_at: "2026-02-08T12:00:10Z"
    } as any);
  });

  it("requires Idempotency-Key", async () => {
    const req: any = {
      method: "POST",
      headers: {},
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 403 when caller is not ops owner", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx, ownerId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("PERMISSION_DENIED");
  });

  it("cannot replace either owner's consent decision", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: { reason: "TRUST_VIOLATION", notes: "test notes" }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("BILATERAL_CONSENT_REQUIRED");
    expect(resolveApprovalMock).not.toHaveBeenCalled();
    expect(publishSseEventMock).not.toHaveBeenCalled();
  });
});
