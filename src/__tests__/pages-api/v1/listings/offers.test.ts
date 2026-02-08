import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const offersHandlerExists = [
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers.ts"),
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers/index.ts"),
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers.js"),
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers/index.js")
].some((candidate) => fs.existsSync(candidate));

const suite = offersHandlerExists ? describe : describe.skip;

suite("POST /v1/listings/{id}/offers (TI-199)", () => {
  const listingId = "11111111-1111-4111-8111-111111111111";
  const threadId = "22222222-2222-4222-8222-222222222222";
  const buyerAgentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const ownerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const validExpiresAt = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const baseCtx: any = {
    ownerId,
    agentId: buyerAgentId,
    actor: { type: "agent", id: buyerAgentId },
    authError: null
  };

  let handler: any;

  let getListingMock: any;
  let getPolicyOrDefaultMock: any;
  let createApprovalMock: any;
  let resolveTrustContextMock: any;
  let publishSseEventMock: any;

  let getThreadMock: any;
  let getThreadForBuyerListingMock: any;
  let createOrGetThreadMock: any;
  let createMessageMock: any;

  let getOpenOfferForThreadMock: any;
  let createOfferMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../server/services/listings", () => ({
      getListing: vi.fn()
    }));

    vi.doMock("../../../../server/services/threads", () => ({
      getThread: vi.fn(),
      getThreadForBuyerListing: vi.fn(),
      createOrGetThread: vi.fn(),
      createMessage: vi.fn()
    }));

    vi.doMock("../../../../server/services/offers", () => ({
      getOpenOfferForThread: vi.fn(),
      createOffer: vi.fn()
    }));

    vi.doMock("../../../../server/services/policies", () => ({
      getPolicyOrDefault: vi.fn()
    }));

    vi.doMock("../../../../server/policy/enforce-allowlist", () => ({
      enforceAllowlist: vi.fn().mockResolvedValue(null)
    }));

    vi.doMock("../../../../server/services/approvals", () => ({
      createApproval: vi.fn()
    }));

    vi.doMock("../../../../server/trustscore/context", () => ({
      resolveTrustContext: vi.fn()
    }));

    vi.doMock("../../../../server/sse/store", () => ({
      publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
    }));

    ({ handler } = await import("../../../../pages/api/v1/listings/[id]/offers"));

    const listingsMod = await import("../../../../server/services/listings");
    getListingMock = vi.mocked(listingsMod.getListing);

    const threadsMod = await import("../../../../server/services/threads");
    getThreadMock = vi.mocked(threadsMod.getThread);
    getThreadForBuyerListingMock = vi.mocked(threadsMod.getThreadForBuyerListing);
    createOrGetThreadMock = vi.mocked(threadsMod.createOrGetThread);
    createMessageMock = vi.mocked(threadsMod.createMessage);

    const offersMod = await import("../../../../server/services/offers");
    getOpenOfferForThreadMock = vi.mocked(offersMod.getOpenOfferForThread);
    createOfferMock = vi.mocked(offersMod.createOffer);

    const policiesMod = await import("../../../../server/services/policies");
    getPolicyOrDefaultMock = vi.mocked(policiesMod.getPolicyOrDefault);

    const approvalsMod = await import("../../../../server/services/approvals");
    createApprovalMock = vi.mocked(approvalsMod.createApproval);

    const trustMod = await import("../../../../server/trustscore/context");
    resolveTrustContextMock = vi.mocked(trustMod.resolveTrustContext);

    const sseMod = await import("../../../../server/sse/store");
    publishSseEventMock = vi.mocked(sseMod.publishSseEvent);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUDIT_HMAC_SECRET = "unit-test-secret";

    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: false } as any);

    getListingMock.mockResolvedValue({
      listing_id: listingId,
      owner_id: ownerId,
      seller_agent_id: sellerAgentId,
      status: "LIVE"
    } as any);

    getThreadMock.mockResolvedValue({
      thread_id: threadId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      status: "OPEN",
      created_at: "2026-02-06T12:00:00Z"
    } as any);

    getThreadForBuyerListingMock.mockResolvedValue(null);
    createOrGetThreadMock.mockResolvedValue({
      thread: {
        thread_id: threadId,
        listing_id: listingId,
        buyer_agent_id: buyerAgentId,
        seller_agent_id: sellerAgentId,
        status: "OPEN",
        created_at: "2026-02-06T12:00:00Z"
      },
      created: false
    } as any);

    getOpenOfferForThreadMock.mockResolvedValue(null);

    getPolicyOrDefaultMock.mockResolvedValue({
      policy_json: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400 }
      }
    } as any);

    createApprovalMock.mockResolvedValue({
      approval_id: "appr-1",
      state: "PENDING",
      action_type: "offer_over_budget",
      action_ref: {}
    } as any);

    createOfferMock.mockResolvedValue({
      offer_id: "o1",
      thread_id: threadId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      previous_offer_id: null,
      amount: 350,
      currency: "EUR",
      expires_at: "2026-02-06T13:00:00Z",
      status: "CREATED",
      created_at: "2026-02-06T12:00:00Z",
      updated_at: "2026-02-06T12:00:00Z"
    } as any);

    createMessageMock.mockResolvedValue({
      message_id: "m1",
      thread_id: threadId,
      sender_id: buyerAgentId,
      sender_type: "agent",
      type: "offer",
      payload: { type: "offer", offer_id: "o1" },
      redacted: false,
      created_at: "2026-02-06T12:00:00Z"
    } as any);
  });

  it("requires Idempotency-Key", async () => {
    const req: any = {
      method: "POST",
      headers: {},
      query: { id: listingId },
      body: { thread_id: threadId, amount: 350, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("returns 401 when agent authentication is missing", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { thread_id: threadId, amount: 350, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("validates listing id UUID", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: "not-a-uuid" },
      body: { thread_id: threadId, amount: 350, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("returns 404 NOT_FOUND when listing does not exist", async () => {
    getListingMock.mockResolvedValue(null);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { thread_id: threadId, amount: 350, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("returns 409 LISTING_NOT_LIVE when listing is not LIVE", async () => {
    getListingMock.mockResolvedValue({
      listing_id: listingId,
      owner_id: ownerId,
      seller_agent_id: sellerAgentId,
      status: "DRAFT"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { thread_id: threadId, amount: 350, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("LISTING_NOT_LIVE");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("returns 400 SELF_OFFER_FORBIDDEN when buyer tries to offer on their own listing", async () => {
    getListingMock.mockResolvedValue({
      listing_id: listingId,
      owner_id: ownerId,
      seller_agent_id: buyerAgentId,
      status: "LIVE"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { thread_id: threadId, amount: 350, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("SELF_OFFER_FORBIDDEN");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_EXPIRES_AT when expires_at is not parseable", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { thread_id: threadId, amount: 350, currency: "EUR", expires_at: "not-a-date" }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("INVALID_EXPIRES_AT");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_EXPIRES_AT when expires_at is in the past", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-06T12:00:00Z"));

    try {
      const req: any = {
        method: "POST",
        headers: { "idempotency-key": "idem-1" },
        query: { id: listingId },
        body: {
          thread_id: threadId,
          amount: 350,
          currency: "EUR",
          expires_at: new Date(Date.now() - 60 * 1000).toISOString()
        }
      };

      const result: any = await handler(req, null, { ...baseCtx });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("INVALID_EXPIRES_AT");
      expect(createOfferMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 400 INVALID_EXPIRES_AT when expires_at is too far (> 7 days)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-06T12:00:00Z"));

    try {
      const req: any = {
        method: "POST",
        headers: { "idempotency-key": "idem-1" },
        query: { id: listingId },
        body: {
          thread_id: threadId,
          amount: 350,
          currency: "EUR",
          expires_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()
        }
      };

      const result: any = await handler(req, null, { ...baseCtx });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("INVALID_EXPIRES_AT");
      expect(createOfferMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 400 INVALID_EXPIRES_AT when expires_at is too soon (< 10 minutes)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-06T12:00:00Z"));

    try {
      const req: any = {
        method: "POST",
        headers: { "idempotency-key": "idem-1" },
        query: { id: listingId },
        body: {
          thread_id: threadId,
          amount: 350,
          currency: "EUR",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        }
      };

      const result: any = await handler(req, null, { ...baseCtx });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("INVALID_EXPIRES_AT");
      expect(createOfferMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 409 OFFER_ALREADY_OPEN when an open offer already exists for the thread", async () => {
    getOpenOfferForThreadMock.mockResolvedValue({
      offer_id: "open-1",
      thread_id: threadId,
      status: "CREATED"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { thread_id: threadId, amount: 350, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("OFFER_ALREADY_OPEN");
    expect(result.body.error.details?.existing_offer_id).toBe("open-1");
    expect(createOfferMock).not.toHaveBeenCalled();
  });

  it("returns 409 APPROVAL_REQUIRED + creates approval when offer is over budget", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { thread_id: threadId, amount: 500, currency: "EUR", expires_at: validExpiresAt() }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("APPROVAL_REQUIRED");
    expect(result.body.error.details?.approval_id).toBe("appr-1");
    expect(typeof result.body.error.details?.reason).toBe("string");
    expect(createApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId,
        actionType: "offer_over_budget",
        createdByAgentId: buyerAgentId
      })
    );
    expect(createOfferMock).not.toHaveBeenCalled();
    expect(createMessageMock).not.toHaveBeenCalled();
    expect(ctx.auditEvent).toBe("offer.approval_required");
  });

  it("auto-creates thread when thread_id is omitted", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { amount: 350, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(201);
    expect(result.body.thread_id).toBe(threadId);
    expect(getThreadMock).not.toHaveBeenCalled();
    expect(createOrGetThreadMock).toHaveBeenCalled();
  });

  it("creates offer + posts typed offer message + publishes SSE under budget", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { thread_id: threadId, amount: 350, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(201);
    expect(result.body.offer_id).toBe("o1");
    expect(result.body.status).toBe("CREATED");

    expect(createOfferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId,
        listingId,
        buyerAgentId,
        sellerAgentId,
        amount: 350,
        currency: "EUR"
      })
    );

    expect(createMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId,
        senderId: buyerAgentId,
        senderType: "agent",
        type: "offer",
        payload: { type: "offer", offer_id: "o1" },
        redacted: false
      })
    );

    expect(publishSseEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: "offer.created" }));
  });

  it("returns 403 TRUST_RESTRICTED when trust flags block offer creation", async () => {
    resolveTrustContextMock.mockResolvedValue({ trust_flags: ["restricted"], quarantine_applied: false } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { id: listingId },
      body: { thread_id: threadId, amount: 350, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("TRUST_RESTRICTED");
    expect(createOfferMock).not.toHaveBeenCalled();
  });
});
