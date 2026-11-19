import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

describe("POST /v1/offers/{offer_id}/accept buyer owner policy", () => {
  const offerId = "11111111-1111-4111-8111-111111111111";
  const threadId = "22222222-2222-4222-8222-222222222222";
  const listingId = "33333333-3333-4333-8333-333333333333";
  const buyerAgentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const ownerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const buyerCtx = () => ({
    ownerId,
    agentId: buyerAgentId,
    actor: { type: "agent", id: buyerAgentId },
    authError: null
  });

  const request = () => ({
    method: "POST",
    headers: { "idempotency-key": "idem-accept-1" },
    query: { offer_id: offerId },
    body: {}
  });

  let handler: any;
  let getOfferMock: any;
  let acceptOfferMock: any;
  let getPolicyOrDefaultMock: any;
  let enforceAllowlistMock: any;
  let createApprovalMock: any;

  beforeAll(async () => {
    vi.resetModules();

    vi.doMock("../../../../server/services/offers", () => ({
      getOffer: vi.fn(),
      acceptOffer: vi.fn()
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
    vi.doMock("../../../../server/sse/store", () => ({
      publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
    }));
    vi.doMock("../../../../server/audit/singleton", () => ({
      safeAuditLog: vi.fn().mockResolvedValue(undefined)
    }));
    vi.doMock("../../../../server/policy/buy-mission-guard", () => ({
      enforceBuyMissionOffer: vi.fn()
    }));
    vi.doMock("../../../../server/policy/buy-mission-approval", () => ({
      createBuyMissionOfferApproval: vi.fn()
    }));

    ({ handler } = await import("../../../../pages/api/v1/offers/[offer_id]/accept"));

    const offersMod = await import("../../../../server/services/offers");
    getOfferMock = vi.mocked(offersMod.getOffer);
    acceptOfferMock = vi.mocked(offersMod.acceptOffer);
    getPolicyOrDefaultMock = vi.mocked((await import("../../../../server/services/policies")).getPolicyOrDefault);
    enforceAllowlistMock = vi.mocked((await import("../../../../server/policy/enforce-allowlist")).enforceAllowlist);
    createApprovalMock = vi.mocked((await import("../../../../server/services/approvals")).createApproval);
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();

    getOfferMock.mockResolvedValue({
      offer_id: offerId,
      thread_id: threadId,
      listing_id: listingId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      proposed_by_agent_id: sellerAgentId,
      buy_mission_id: null,
      amount: 900,
      currency: "EUR",
      expires_at: "2026-02-06T13:00:00Z",
      status: "CREATED"
    } as any);
    getPolicyOrDefaultMock.mockResolvedValue({
      policy_json: { budgets: { max_offer: 100, currency: "EUR" } }
    } as any);
    enforceAllowlistMock.mockResolvedValue(null);
    createApprovalMock.mockResolvedValue({ approval_id: "appr-accept-1", state: "PENDING" } as any);
    acceptOfferMock.mockResolvedValue({
      offer_id: offerId,
      offer_status: "ACCEPTED",
      tx_id: "tx-1",
      listing_id: listingId,
      thread_id: threadId,
      accepted_offer_id: offerId,
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      tx_status: "ACCEPTED",
      contact_reveal_state: "NOT_REQUESTED",
      tx_created_at: "2026-02-06T12:05:00Z",
      listing_status: "RESERVED"
    } as any);
  });

  it("requires owner approval when the buyer accepts a seller counter above the buyer cap", async () => {
    const ctx: any = buyerCtx();
    const result: any = await handler(request(), null, ctx);

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("APPROVAL_REQUIRED");
    expect(result.body.error.details).toMatchObject({ approval_id: "appr-accept-1", reason: "offer_above_limit" });
    expect(acceptOfferMock).not.toHaveBeenCalled();
    expect(getPolicyOrDefaultMock).toHaveBeenCalledWith(ownerId);
    expect(createApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId,
        actionType: "offer_over_budget",
        createdByAgentId: buyerAgentId,
        actionRef: expect.objectContaining({
          previous_offer_id: offerId,
          agent_id: buyerAgentId,
          amount: 900,
          currency: "EUR"
        })
      })
    );
    expect(ctx.policy).toMatchObject({ decision: "REQUIRES_APPROVAL", approval_id: "appr-accept-1" });
  });

  it("accepts a seller counter within the buyer cap", async () => {
    getOfferMock.mockResolvedValueOnce({ ...(await getOfferMock()), amount: 90 });
    const result: any = await handler(request(), null, buyerCtx());

    expect(result.status).toBe(200);
    expect(createApprovalMock).not.toHaveBeenCalled();
    expect(acceptOfferMock).toHaveBeenCalledWith({ offerId, actorAgentId: buyerAgentId });
  });

  it("blocks acceptance from a seller denied by the buyer owner allowlist", async () => {
    enforceAllowlistMock.mockResolvedValueOnce({ status: 403, body: { error: { code: "SENDER_NOT_ALLOWED" } } });
    const result: any = await handler(request(), null, buyerCtx());

    expect(result.status).toBe(403);
    expect(acceptOfferMock).not.toHaveBeenCalled();
    expect(createApprovalMock).not.toHaveBeenCalled();
  });

  it("does not apply the buyer policy when the seller accepts the buyer offer", async () => {
    getOfferMock.mockResolvedValueOnce({ ...(await getOfferMock()), proposed_by_agent_id: buyerAgentId });
    const ctx: any = { ...buyerCtx(), agentId: sellerAgentId, actor: { type: "agent", id: sellerAgentId } };
    const result: any = await handler(request(), null, ctx);

    expect(result.status).toBe(200);
    expect(getPolicyOrDefaultMock).not.toHaveBeenCalled();
    expect(acceptOfferMock).toHaveBeenCalledWith({ offerId, actorAgentId: sellerAgentId });
  });
});
