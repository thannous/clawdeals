import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../http", () => ({ callClawdealsWebmcp: vi.fn() }));

import { callClawdealsWebmcp } from "../http";
import { negotiationTools } from "./negotiation-tools";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "22222222-2222-4222-8222-222222222222";
const OFFER_ID = "33333333-3333-4333-8333-333333333333";
const MISSION_ID = "44444444-4444-4444-8444-444444444444";
const TX_ID = "55555555-5555-4555-8555-555555555555";
const EXPIRES_AT = "2026-08-26T12:00:00.000Z";
const context = {
  requestId: "request-1",
  idempotencyKey: "idem-1",
  signal: new AbortController().signal
};

function tool(name: string) {
  return negotiationTools.find((candidate) => candidate.name === name)!;
}

describe("negotiation WebMCP tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes the five confirmed mutation contracts", () => {
    expect(negotiationTools.map((candidate) => candidate.name)).toEqual([
      "start_thread",
      "send_message",
      "make_offer",
      "respond_to_offer",
      "request_contact_reveal"
    ]);
    expect(negotiationTools.every((candidate) => candidate.requiresConfirmation)).toBe(true);
    expect(negotiationTools.every((candidate) => candidate.scope === "write")).toBe(true);
  });

  it("creates a thread with a typed question and omits participant IDs", async () => {
    vi.mocked(callClawdealsWebmcp).mockResolvedValue({
      ok: true,
      data: {
        thread_id: THREAD_ID,
        listing_id: LISTING_ID,
        buyer_agent_id: "private-buyer",
        seller_agent_id: "private-seller",
        status: "OPEN",
        initial_message_id: "message-1"
      },
      meta: { request_id: "server-1" }
    } as any);

    const result = await tool("start_thread").execute(
      { listing_id: LISTING_ID, intent: "ASK", initial_question: "Battery health?" } as any,
      context
    );

    expect(callClawdealsWebmcp).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/listings/${LISTING_ID}/threads`,
        idempotencyKey: "idem-1",
        body: { intent: "ASK", message: { type: "question", text: "Battery health?" } }
      })
    );
    expect(result).toMatchObject({ ok: true, data: { thread_id: THREAD_ID } });
    if (result.ok) {
      expect(result.data).not.toHaveProperty("buyer_agent_id");
      expect(result.data).not.toHaveProperty("seller_agent_id");
    }
  });

  it("turns a pending 202 payload into APPROVAL_REQUIRED", async () => {
    vi.mocked(callClawdealsWebmcp).mockResolvedValue({
      ok: true,
      data: {
        data: { approval_id: "approval-1", state: "PENDING", action_type: "message.send" }
      },
      meta: { request_id: "server-2" }
    } as any);

    const result = await tool("send_message").execute(
      { thread_id: THREAD_ID, type: "question", text: "Receipt?" } as any,
      context
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "APPROVAL_REQUIRED",
        details: { approval_id: "approval-1", action_type: "message.send" }
      }
    });
  });

  it("binds make_offer to a mission and forwards cancellation/idempotency", async () => {
    vi.mocked(callClawdealsWebmcp).mockResolvedValue({
      ok: true,
      data: {
        offer_id: OFFER_ID,
        thread_id: THREAD_ID,
        listing_id: LISTING_ID,
        buyer_agent_id: "private-buyer",
        seller_agent_id: "private-seller",
        amount: 1200,
        currency: "EUR",
        status: "CREATED",
        expires_at: EXPIRES_AT
      },
      meta: { request_id: "server-3" }
    } as any);

    const result = await tool("make_offer").execute(
      {
        mission_id: MISSION_ID,
        listing_id: LISTING_ID,
        amount: 1200,
        currency: "EUR",
        expires_at: EXPIRES_AT
      } as any,
      context
    );

    expect(callClawdealsWebmcp).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/listings/${LISTING_ID}/offers`,
        idempotencyKey: "idem-1",
        signal: context.signal,
        body: expect.objectContaining({ mission_id: MISSION_ID, amount: 1200 })
      })
    );
    expect(result).toMatchObject({ ok: true, data: { offer_id: OFFER_ID } });
    if (result.ok) {
      expect(result.data).not.toHaveProperty("buyer_agent_id");
      expect(result.data).not.toHaveProperty("seller_agent_id");
    }
  });

  it("uses one mutually exclusive respond_to_offer contract", async () => {
    const respond = tool("respond_to_offer");
    expect(respond.zodSchema.safeParse({ offer_id: OFFER_ID, action: "accept" }).success).toBe(true);
    expect(
      respond.zodSchema.safeParse({ offer_id: OFFER_ID, action: "counter", amount: 1100 }).success
    ).toBe(false);
    expect(
      respond.zodSchema.safeParse({
        offer_id: OFFER_ID,
        action: "decline",
        amount: 1100,
        currency: "EUR",
        expires_at: EXPIRES_AT
      }).success
    ).toBe(false);

    vi.mocked(callClawdealsWebmcp).mockResolvedValue({
      ok: true,
      data: {
        offer_id: OFFER_ID,
        status: "ACCEPTED",
        listing_status: "RESERVED",
        transaction: {
          tx_id: "tx-1",
          listing_id: LISTING_ID,
          accepted_offer_id: OFFER_ID,
          buyer_agent_id: "private-buyer",
          seller_agent_id: "private-seller",
          status: "ACCEPTED",
          contact_reveal_state: "NOT_REQUESTED"
        }
      },
      meta: { request_id: "server-4" }
    } as any);

    const result = await respond.execute(
      { offer_id: OFFER_ID, action: "accept", mission_id: MISSION_ID } as any,
      context
    );

    expect(callClawdealsWebmcp).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/offers/${OFFER_ID}/accept`,
        body: { mission_id: MISSION_ID }
      })
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        listing_status: "RESERVED",
        transaction: { contact_reveal_state: "NOT_REQUESTED" }
      }
    });
    if (result.ok) {
      expect((result.data as any).transaction).not.toHaveProperty("buyer_agent_id");
      expect((result.data as any).transaction).not.toHaveProperty("seller_agent_id");
    }
  });

  it("requests bilateral contact reveal without returning contacts", async () => {
    vi.mocked(callClawdealsWebmcp).mockResolvedValue({
      ok: true,
      data: {
        tx_id: TX_ID,
        contact_reveal_state: "REQUESTED",
        approval_id: "66666666-6666-4666-8666-666666666666",
        requester_role: "BUYER",
        consent_states: { buyer: "PENDING", seller: "PENDING" },
        buyer_contact: { email: "must-not-leak@example.com" }
      },
      meta: { request_id: "server-5" }
    } as any);

    const result = await tool("request_contact_reveal").execute({ tx_id: TX_ID } as any, context);

    expect(callClawdealsWebmcp).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `/v1/transactions/${TX_ID}/request-contact-reveal`,
        body: {},
        idempotencyKey: "idem-1",
        signal: context.signal
      })
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        tx_id: TX_ID,
        contact_reveal_state: "REQUESTED",
        requester_role: "BUYER",
        consent_states: { buyer: "PENDING", seller: "PENDING" }
      }
    });
    if (result.ok) expect(result.data).not.toHaveProperty("buyer_contact");
  });
});
