import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/offers", () => ({
  acceptOffer: vi.fn(),
  cancelOffer: vi.fn(),
  declineOffer: vi.fn()
}));

vi.mock("../../../../server/sse/store", () => ({
  publishSseEvent: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock("../../../../server/audit/singleton", () => ({
  safeAuditLog: vi.fn().mockResolvedValue({ ok: true })
}));

import { handler as acceptHandler } from "../../../../pages/api/v1/offers/[offer_id]/accept";
import { handler as cancelHandler } from "../../../../pages/api/v1/offers/[offer_id]/cancel";
import { handler as declineHandler } from "../../../../pages/api/v1/offers/[offer_id]/decline";
import {
  acceptOffer,
  cancelOffer,
  declineOffer
} from "../../../../server/services/offers";
import { publishSseEvent } from "../../../../server/sse/store";
import { safeAuditLog } from "../../../../server/audit/singleton";

const acceptOfferMock = vi.mocked(acceptOffer);
const cancelOfferMock = vi.mocked(cancelOffer);
const declineOfferMock = vi.mocked(declineOffer);
const publishSseEventMock = vi.mocked(publishSseEvent);
const safeAuditLogMock = vi.mocked(safeAuditLog);

const OFFER_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SELLER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function request(headers: any = { "idempotency-key": "idem-1" }) {
  return {
    method: "POST",
    headers,
    query: { offer_id: OFFER_ID },
    body: {}
  } as any;
}

function context(overrides: any = {}) {
  return {
    authError: null,
    agentId: SELLER_ID,
    ownerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    actor: { type: "agent", id: SELLER_ID },
    requestId: "request-1",
    ...overrides
  } as any;
}

describe("offer action API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishSseEventMock.mockResolvedValue({ ok: true } as any);
    safeAuditLogMock.mockResolvedValue({ ok: true } as any);
  });

  it.each([
    ["accept", acceptHandler, acceptOfferMock],
    ["cancel", cancelHandler, cancelOfferMock],
    ["decline", declineHandler, declineOfferMock]
  ])("requires an idempotency key before %s", async (_name, handler, actionMock) => {
    const result: any = await handler(request({}), null, context());

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(actionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["accept", acceptHandler, acceptOfferMock],
    ["cancel", cancelHandler, cancelOfferMock],
    ["decline", declineHandler, declineOfferMock]
  ])("requires an authenticated agent before %s", async (_name, handler, actionMock) => {
    const result: any = await handler(request(), null, context({ agentId: null }));

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(actionMock).not.toHaveBeenCalled();
  });

  it("accepts atomically, emits transaction audit data, and notifies both participants", async () => {
    acceptOfferMock.mockResolvedValue({
      offer_id: OFFER_ID,
      offer_status: "ACCEPTED",
      listing_id: "listing-1",
      listing_status: "LOCKED",
      thread_id: "thread-1",
      tx_id: "tx-1",
      accepted_offer_id: OFFER_ID,
      buyer_agent_id: BUYER_ID,
      seller_agent_id: SELLER_ID,
      tx_status: "ACCEPTED",
      contact_reveal_state: "HIDDEN",
      tx_created_at: "2026-07-23T12:00:00.000Z"
    } as any);
    const ctx = context();

    const result: any = await acceptHandler(request(), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      offer_id: OFFER_ID,
      status: "ACCEPTED",
      listing_status: "LOCKED",
      transaction: {
        tx_id: "tx-1",
        accepted_offer_id: OFFER_ID,
        status: "ACCEPTED"
      }
    });
    expect(acceptOfferMock).toHaveBeenCalledWith({
      offerId: OFFER_ID,
      actorAgentId: SELLER_ID
    });
    expect(safeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ event: "transaction.create" }),
        payload: expect.objectContaining({ tx_id: "tx-1", accepted_offer_id: OFFER_ID })
      })
    );
    expect(publishSseEventMock).toHaveBeenCalledTimes(4);
    expect(ctx.body).toMatchObject({
      offer_id: OFFER_ID,
      listing_id: "listing-1",
      thread_id: "thread-1",
      tx_id: "tx-1"
    });
  });

  it.each([
    ["cancel", cancelHandler, cancelOfferMock, "CANCELLED", "cancelled_at", "offer.cancelled"],
    ["decline", declineHandler, declineOfferMock, "DECLINED", "declined_at", "offer.declined"]
  ])(
    "%s returns the transition timestamp and deduplicates identical SSE audiences",
    async (_name, handler, actionMock, status, timestampField, eventType) => {
      actionMock.mockResolvedValue({
        offer_id: OFFER_ID,
        offer_status: status,
        updated_at: "2026-07-23T12:00:00.000Z",
        listing_id: "listing-1",
        thread_id: "thread-1",
        buyer_agent_id: BUYER_ID,
        seller_agent_id: BUYER_ID
      } as any);

      const result: any = await handler(request(), null, context({ agentId: BUYER_ID }));

      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        offer_id: OFFER_ID,
        status,
        [timestampField]: "2026-07-23T12:00:00.000Z"
      });
      expect(publishSseEventMock).toHaveBeenCalledTimes(1);
      expect(publishSseEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audienceId: BUYER_ID,
          type: eventType,
          entity: { type: "offer", id: OFFER_ID }
        })
      );
    }
  );

  it("returns the atomic service conflict without losing actionable status", async () => {
    declineOfferMock.mockRejectedValue(
      Object.assign(new Error("Offer not actionable"), {
        status: 409,
        code: "OFFER_NOT_ACTIONABLE",
        details: { status: "ACCEPTED" }
      })
    );

    const result: any = await declineHandler(request(), null, context());

    expect(result.status).toBe(409);
    expect(result.body.error).toMatchObject({
      code: "OFFER_NOT_ACTIONABLE",
      details: { status: "ACCEPTED" }
    });
    expect(publishSseEventMock).not.toHaveBeenCalled();
  });

  it("returns upstream authentication errors before validating request fields", async () => {
    const result: any = await acceptHandler(
      { method: "POST", headers: {}, query: { offer_id: "bad" } } as any,
      null,
      context({
        authError: { status: 403, code: "INVALID_API_KEY", message: "Invalid API key" }
      })
    );

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("INVALID_API_KEY");
    expect(acceptOfferMock).not.toHaveBeenCalled();
  });
});
