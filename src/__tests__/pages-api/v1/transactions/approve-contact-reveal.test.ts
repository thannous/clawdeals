import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const handlerExists = [
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/approve-contact-reveal.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/approve-contact-reveal/index.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/approve-contact-reveal.js"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/approve-contact-reveal/index.js")
].some((candidate) => fs.existsSync(candidate));

const suite = handlerExists ? describe : describe.skip;

suite("POST /v1/transactions/{tx_id}/approve-contact-reveal (TI-203)", () => {
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
  let getMaskedContactsForTransactionMock: any;
  let getContactRevealApprovalByTxIdMock: any;
  let resolveApprovalMock: any;
  let publishSseEventMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../server/services/transactions", () => ({
      getTransaction: vi.fn(),
      getMaskedContactsForTransaction: vi.fn(),
      getContactRevealApprovalByTxId: vi.fn()
    }));

    vi.doMock("../../../../server/services/approvals", () => ({
      resolveApproval: vi.fn()
    }));

    vi.doMock("../../../../server/sse/store", () => ({
      publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
    }));

    ({ handler } = await import("../../../../pages/api/v1/transactions/[tx_id]/approve-contact-reveal"));

    const txMod = await import("../../../../server/services/transactions");
    getTransactionMock = vi.mocked(txMod.getTransaction);
    getMaskedContactsForTransactionMock = vi.mocked(txMod.getMaskedContactsForTransaction);
    getContactRevealApprovalByTxIdMock = vi.mocked(txMod.getContactRevealApprovalByTxId);

    const approvalsMod = await import("../../../../server/services/approvals");
    resolveApprovalMock = vi.mocked(approvalsMod.resolveApproval);

    const sseMod = await import("../../../../server/sse/store");
    publishSseEventMock = vi.mocked(sseMod.publishSseEvent);
  });

  beforeEach(() => {
    vi.clearAllMocks();

    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "ACCEPTED",
      contact_reveal_state: "REQUESTED",
      contact_revealed_at: null
    } as any);

    getContactRevealApprovalByTxIdMock.mockResolvedValue({
      approval_id: "appr-1",
      owner_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      state: "PENDING"
    } as any);

    resolveApprovalMock.mockResolvedValue({
      approval_id: "appr-1",
      state: "APPROVED"
    } as any);

    getMaskedContactsForTransactionMock.mockResolvedValue({
      buyer_contact: { email_masked: "b***@e******.com", phone_masked: "+33 ** ** ** 12 34" },
      seller_contact: { email_masked: "s***@g****.fr", phone_masked: "+33 ** ** ** 56 78" }
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

  it("returns 409 when tx is not REQUESTED", async () => {
    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "ACCEPTED",
      contact_reveal_state: "NOT_REQUESTED"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("TX_NOT_REQUESTED");
  });

  it("returns 409 and does not approve when contacts are missing/unverified", async () => {
    const error: any = new Error("Owner contact missing or unverified");
    error.status = 409;
    error.code = "OWNER_CONTACT_MISSING";
    getMaskedContactsForTransactionMock.mockRejectedValueOnce(error);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("OWNER_CONTACT_MISSING");
    expect(resolveApprovalMock).not.toHaveBeenCalled();
    expect(publishSseEventMock).not.toHaveBeenCalled();
  });

  it("approves => 200 with masked contacts", async () => {
    getTransactionMock
      .mockResolvedValueOnce({
        tx_id: txId,
        listing_id: listingId,
        buyer_agent_id: buyerAgentId,
        seller_agent_id: sellerAgentId,
        status: "ACCEPTED",
        contact_reveal_state: "REQUESTED",
        contact_revealed_at: null
      } as any)
      .mockResolvedValueOnce({
        tx_id: txId,
        listing_id: listingId,
        buyer_agent_id: buyerAgentId,
        seller_agent_id: sellerAgentId,
        status: "CONTACT_REVEALED",
        contact_reveal_state: "APPROVED",
        contact_revealed_at: "2026-02-08T12:00:00Z"
      } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.contact_reveal_state).toBe("APPROVED");
    expect(result.body.buyer_contact?.email_masked).toContain("***");
    expect(publishSseEventMock).toHaveBeenCalled();
  });
});
