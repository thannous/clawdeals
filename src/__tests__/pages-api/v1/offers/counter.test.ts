import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

const counterHandlerExists = [
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter.ts"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter/index.ts"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter.js"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter/index.js")
].some((candidate) => fs.existsSync(candidate));

const suite = counterHandlerExists ? describe : describe.skip;

suite("POST /v1/offers/{offer_id}/counter (TI-200)", () => {
  const offerId = "11111111-1111-4111-8111-111111111111";
  const threadId = "22222222-2222-4222-8222-222222222222";
  const listingId = "33333333-3333-4333-8333-333333333333";
  const buyerAgentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const ownerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const missionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  const validExpiresAt = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const baseCtx: any = {
    ownerId,
    agentId: buyerAgentId,
    actor: { type: "agent", id: buyerAgentId },
    authError: null
  };

  let handler: any;

  let getOfferMock: any;
  let getOpenOfferForThreadMock: any;
  let counterOfferMock: any;
  let getListingMock: any;
  let getPolicyOrDefaultMock: any;
  let enforceAllowlistMock: any;
  let createApprovalMock: any;
  let resolveTrustContextMock: any;
  let publishSseEventMock: any;
  let enforceBuyMissionOfferMock: any;
  let createBuyMissionOfferApprovalMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../server/services/offers", () => ({
      getOffer: vi.fn(),
      getOpenOfferForThread: vi.fn(),
      counterOffer: vi.fn()
    }));

    vi.doMock("../../../../server/services/listings", () => ({
      getListing: vi.fn()
    }));

    vi.doMock("../../../../server/services/policies", () => ({
      getPolicyOrDefault: vi.fn()
    }));

    vi.doMock("../../../../server/policy/enforce-allowlist", () => ({
      enforceAllowlist: vi.fn()
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

    vi.doMock("../../../../server/policy/buy-mission-guard", () => ({
      enforceBuyMissionOffer: vi.fn()
    }));

    vi.doMock("../../../../server/policy/buy-mission-approval", () => ({
      createBuyMissionOfferApproval: vi.fn()
    }));

    ({ handler } = await import("../../../../pages/api/v1/offers/[offer_id]/counter"));

    const offersMod = await import("../../../../server/services/offers");
    getOfferMock = vi.mocked(offersMod.getOffer);
    getOpenOfferForThreadMock = vi.mocked(offersMod.getOpenOfferForThread);
    counterOfferMock = vi.mocked(offersMod.counterOffer);

    const listingsMod = await import("../../../../server/services/listings");
    getListingMock = vi.mocked(listingsMod.getListing);

    const policiesMod = await import("../../../../server/services/policies");
    getPolicyOrDefaultMock = vi.mocked(policiesMod.getPolicyOrDefault);

    const allowlistMod = await import("../../../../server/policy/enforce-allowlist");
    enforceAllowlistMock = vi.mocked(allowlistMod.enforceAllowlist);

    const approvalsMod = await import("../../../../server/services/approvals");
    createApprovalMock = vi.mocked(approvalsMod.createApproval);

    const trustMod = await import("../../../../server/trustscore/context");
    resolveTrustContextMock = vi.mocked(trustMod.resolveTrustContext);

    const sseMod = await import("../../../../server/sse/store");
    publishSseEventMock = vi.mocked(sseMod.publishSseEvent);

    const missionGuardMod = await import("../../../../server/policy/buy-mission-guard");
    enforceBuyMissionOfferMock = vi.mocked(missionGuardMod.enforceBuyMissionOffer);

    const missionApprovalMod = await import("../../../../server/policy/buy-mission-approval");
    createBuyMissionOfferApprovalMock = vi.mocked(
      missionApprovalMod.createBuyMissionOfferApproval
    );
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUDIT_HMAC_SECRET = "unit-test-secret";

    resolveTrustContextMock.mockResolvedValue({ trust_flags: [], quarantine_applied: false } as any);
    enforceAllowlistMock.mockResolvedValue(null);
    enforceBuyMissionOfferMock.mockResolvedValue({ mission: { hard_budget_max: 1300 } } as any);
    createBuyMissionOfferApprovalMock.mockResolvedValue({
      approval_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    } as any);

    getOfferMock.mockResolvedValue({
      offer_id: offerId,
      thread_id: threadId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      previous_offer_id: null,
      amount: 350,
      currency: "EUR",
      expires_at: validExpiresAt(),
      status: "CREATED",
      created_at: "2026-02-06T12:00:00Z"
    } as any);

    getListingMock.mockResolvedValue({
      listing_id: listingId,
      owner_id: ownerId,
      seller_agent_id: sellerAgentId,
      status: "LIVE"
    } as any);

    getOpenOfferForThreadMock.mockResolvedValue({
      offer_id: offerId,
      thread_id: threadId,
      status: "CREATED"
    } as any);

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

    counterOfferMock.mockResolvedValue({
      offer_id: "new-1",
      thread_id: threadId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      previous_offer_id: offerId,
      amount: 360,
      currency: "EUR",
      expires_at: "2026-02-06T13:00:00Z",
      status: "CREATED",
      created_at: "2026-02-06T12:01:00Z"
    } as any);
  });

  it("validates amount upper bound (Postgres int4)", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { offer_id: offerId },
      body: { amount: 2147483648, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toBe("amount must be <= 2147483647");
    expect(counterOfferMock).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_EXPIRES_AT when expires_at is too far (> 7 days)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-06T12:00:00Z"));

    try {
      const req: any = {
        method: "POST",
        headers: { "idempotency-key": "idem-1" },
        query: { offer_id: offerId },
        body: {
          amount: 360,
          currency: "EUR",
          expires_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()
        }
      };

      const result: any = await handler(req, null, { ...baseCtx });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("INVALID_EXPIRES_AT");
      expect(counterOfferMock).not.toHaveBeenCalled();
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
        query: { offer_id: offerId },
        body: {
          amount: 360,
          currency: "EUR",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        }
      };

      const result: any = await handler(req, null, { ...baseCtx });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("INVALID_EXPIRES_AT");
      expect(counterOfferMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces allowlist for buyer counter-offers", async () => {
    enforceAllowlistMock.mockResolvedValue({
      status: 403,
      body: { error: { code: "SENDER_NOT_ALLOWED", message: "Sender not allowed" } }
    });

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { offer_id: offerId },
      body: { amount: 360, currency: "EUR", expires_at: validExpiresAt() }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("SENDER_NOT_ALLOWED");
    expect(enforceAllowlistMock).toHaveBeenCalled();
    expect(counterOfferMock).not.toHaveBeenCalled();
  });

  it("does not enforce allowlist for seller counter-offers", async () => {
    enforceAllowlistMock.mockResolvedValue({
      status: 403,
      body: { error: { code: "SENDER_NOT_ALLOWED", message: "Sender not allowed" } }
    });

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "idem-1" },
      query: { offer_id: offerId },
      body: { amount: 360, currency: "EUR", expires_at: validExpiresAt() }
    };

    const ctx: any = {
      ...baseCtx,
      agentId: sellerAgentId,
      actor: { type: "agent", id: sellerAgentId }
    };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(201);
    expect(enforceAllowlistMock).not.toHaveBeenCalled();
    expect(counterOfferMock).toHaveBeenCalledWith(expect.objectContaining({ senderId: sellerAgentId }));
  });
});
