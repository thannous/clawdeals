import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const handlerExists = [
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/request-contact-reveal.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/request-contact-reveal.js")
].some((candidate) => fs.existsSync(candidate));

const suite = handlerExists ? describe : describe.skip;

suite("POST /v1/transactions/{tx_id}/request-contact-reveal (TI-202)", () => {
  const txId = "11111111-1111-4111-8111-111111111111";
  const listingId = "22222222-2222-4222-8222-222222222222";
  const threadId = "33333333-3333-4333-8333-333333333333";
  const buyerAgentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const ownerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const baseCtx: any = {
    agentId: buyerAgentId,
    ownerId,
    actor: { type: "agent", id: buyerAgentId },
    authError: null
  };

  let handler: any;

  let resolveTrustContextMock: any;
  let getTransactionMock: any;
  let getContactRevealApprovalByTxIdMock: any;
  let requestContactRevealMock: any;
  let getListingMock: any;
  let getPolicyOrDefaultMock: any;
  let publishSseEventMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../server/trustscore/context", () => ({
      resolveTrustContext: vi.fn()
    }));

    vi.doMock("../../../../server/services/transactions", () => ({
      getTransaction: vi.fn(),
      getContactRevealApprovalByTxId: vi.fn(),
      requestContactReveal: vi.fn()
    }));

    vi.doMock("../../../../server/services/listings", () => ({
      getListing: vi.fn()
    }));

    vi.doMock("../../../../server/services/policies", () => ({
      getPolicyOrDefault: vi.fn()
    }));

    vi.doMock("../../../../server/sse/store", () => ({
      publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
    }));

    ({ handler } = await import("../../../../pages/api/v1/transactions/[tx_id]/request-contact-reveal"));

    const trustMod = await import("../../../../server/trustscore/context");
    resolveTrustContextMock = vi.mocked(trustMod.resolveTrustContext);

    const txMod = await import("../../../../server/services/transactions");
    getTransactionMock = vi.mocked(txMod.getTransaction);
    getContactRevealApprovalByTxIdMock = vi.mocked(txMod.getContactRevealApprovalByTxId);
    requestContactRevealMock = vi.mocked(txMod.requestContactReveal);

    const listingsMod = await import("../../../../server/services/listings");
    getListingMock = vi.mocked(listingsMod.getListing);

    const policiesMod = await import("../../../../server/services/policies");
    getPolicyOrDefaultMock = vi.mocked(policiesMod.getPolicyOrDefault);

    const sseMod = await import("../../../../server/sse/store");
    publishSseEventMock = vi.mocked(sseMod.publishSseEvent);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FEATURE_CONTACT_REVEAL_AUTO_APPROVE;

    resolveTrustContextMock.mockResolvedValue({ trust_score: 90, trust_flags: [] } as any);

    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      listing_id: listingId,
      thread_id: threadId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "ACCEPTED",
      contact_reveal_state: "NOT_REQUESTED",
      contact_revealed_at: null
    } as any);

    getListingMock.mockResolvedValue({
      listing_id: listingId,
      owner_id: ownerId
    } as any);

    getPolicyOrDefaultMock.mockResolvedValue({
      policy_json: { approval_thresholds: { contact_reveal: "always" } }
    } as any);

    getContactRevealApprovalByTxIdMock.mockResolvedValue({
      approval_id: "appr-1",
      state: "PENDING",
      action_type: "contact_reveal",
      action_ref_id: txId
    } as any);

    requestContactRevealMock.mockResolvedValue({
      tx_id: txId,
      tx_status: "ACCEPTED",
      contact_reveal_state: "REQUESTED",
      contact_revealed_at: null,
      approval_id: "appr-1"
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
    expect(requestContactRevealMock).not.toHaveBeenCalled();
  });

  it("returns 401 when agent authentication is missing", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx, agentId: null, actor: { type: "anonymous", id: null } });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates tx_id UUID", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: "not-a-uuid" },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 403 TRUST_RESTRICTED when agent is suspended", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_score: 90, trust_flags: ["suspended"] } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("TRUST_RESTRICTED");
    expect(requestContactRevealMock).not.toHaveBeenCalled();
  });

  it("returns 404 TX_NOT_FOUND when agent is not a party", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx, agentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("TX_NOT_FOUND");
    expect(requestContactRevealMock).not.toHaveBeenCalled();
  });

  it("returns 409 TX_NOT_ACCEPTED when tx.status is not ACCEPTED", async () => {
    getTransactionMock.mockResolvedValue({
      tx_id: txId,
      listing_id: listingId,
      thread_id: threadId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "CANCELLED",
      contact_reveal_state: "NOT_REQUESTED",
      contact_revealed_at: null
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("TX_NOT_ACCEPTED");
    expect(requestContactRevealMock).not.toHaveBeenCalled();
  });

  it("manual path => 202 + approval_id", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { tx_id: txId },
      body: {}
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(202);
    expect(result.body.approval_id).toBe("appr-1");
    expect(requestContactRevealMock).toHaveBeenCalledWith({
      txId,
      actorAgentId: buyerAgentId,
      autoApprove: false
    });
  });

  it("auto-approve path => 200", async () => {
    process.env.FEATURE_CONTACT_REVEAL_AUTO_APPROVE = "true";
    getPolicyOrDefaultMock.mockResolvedValue({
      policy_json: { approval_thresholds: { contact_reveal: "auto" } }
    } as any);
    requestContactRevealMock.mockResolvedValue({
      tx_id: txId,
      tx_status: "CONTACT_REVEALED",
      contact_reveal_state: "APPROVED",
      contact_revealed_at: "2026-02-08T12:00:00Z",
      approval_id: null
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
    expect(result.body.contact_revealed_at).toBeTruthy();
    expect(publishSseEventMock).toHaveBeenCalled();
    expect(requestContactRevealMock).toHaveBeenCalledWith({
      txId,
      actorAgentId: buyerAgentId,
      autoApprove: true
    });
  });
});

