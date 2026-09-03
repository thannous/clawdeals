import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  seller: { id: "seller-1" } as { id: string } | null,
  latestOffer: null as Record<string, unknown> | null
}));

vi.mock("../db/supabase", () => {
  const builder = (table: string) => {
    const chain: any = {
      select: () => chain,
      contains: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        data: table === "agents" ? db.seller : db.latestOffer,
        error: null
      })
    };
    return chain;
  };
  return { getSupabaseServiceClient: () => ({ from: builder }) };
});

vi.mock("./offers", () => ({
  acceptOffer: vi.fn(),
  counterOffer: vi.fn()
}));

import { acceptOffer, counterOffer } from "./offers";
import {
  decideSellerTurn,
  runSandboxSellerTurn,
  SANDBOX_SELLER_COUNTER_AMOUNT,
  SANDBOX_SELLER_FLOOR_AMOUNT
} from "./sandbox-seller-autopilot";

const baseOffer = {
  offer_id: "o1",
  previous_offer_id: null,
  thread_id: "t1",
  listing_id: "l1",
  buyer_agent_id: "judge-agent",
  seller_agent_id: "seller-1",
  proposed_by_agent_id: "judge-agent",
  amount: 1100,
  currency: "EUR",
  status: "CREATED",
  expires_at: new Date(Date.now() + 3_600_000).toISOString()
};

describe("decideSellerTurn", () => {
  it("counters below the floor and accepts at or above it", () => {
    expect(decideSellerTurn({ amount: 1100 })).toEqual({ action: "counter", amount: SANDBOX_SELLER_COUNTER_AMOUNT });
    expect(decideSellerTurn({ amount: SANDBOX_SELLER_FLOOR_AMOUNT - 1 })).toEqual({ action: "counter", amount: 1350 });
    expect(decideSellerTurn({ amount: SANDBOX_SELLER_FLOOR_AMOUNT })).toEqual({ action: "accept" });
    expect(decideSellerTurn({ amount: 1300 })).toEqual({ action: "accept" });
  });

  it("keeps the counter above the judge mission hard budget so the buyer agent hits the policy stop", () => {
    expect(SANDBOX_SELLER_COUNTER_AMOUNT).toBeGreaterThan(1300);
  });
});

describe("runSandboxSellerTurn", () => {
  beforeEach(() => {
    vi.mocked(acceptOffer).mockReset();
    vi.mocked(counterOffer).mockReset();
    db.seller = { id: "seller-1" };
    db.latestOffer = { ...baseOffer };
  });

  it("requires the judge reset to have provisioned the synthetic seller", async () => {
    db.seller = null;
    await expect(runSandboxSellerTurn({ buyerAgentId: "judge-agent", judgeAgentId: "judge-agent" })).rejects.toMatchObject({
      status: 409,
      code: "SELLER_NOT_READY"
    });
  });

  it("refuses when the buyer has not made an offer or the latest one is closed", async () => {
    db.latestOffer = null;
    await expect(runSandboxSellerTurn({ buyerAgentId: "judge-agent", judgeAgentId: "judge-agent" })).rejects.toMatchObject({ code: "NO_OPEN_OFFER" });
    db.latestOffer = { ...baseOffer, status: "DECLINED" };
    await expect(runSandboxSellerTurn({ buyerAgentId: "judge-agent", judgeAgentId: "judge-agent" })).rejects.toMatchObject({
      code: "NO_OPEN_OFFER",
      details: { status: "DECLINED" }
    });
  });

  it("counters a 1,100 EUR offer at 1,350 EUR as the seller", async () => {
    vi.mocked(counterOffer).mockResolvedValue({ ...baseOffer, offer_id: "o2", previous_offer_id: "o1", amount: 1350, proposed_by_agent_id: "seller-1" });
    const result = await runSandboxSellerTurn({ buyerAgentId: "judge-agent", judgeAgentId: "judge-agent", now: new Date("2026-09-03T10:00:00Z") });
    expect(counterOffer).toHaveBeenCalledWith(
      expect.objectContaining({ previousOfferId: "o1", threadId: "t1", amount: 1350, currency: "EUR", senderId: "seller-1" })
    );
    expect(acceptOffer).not.toHaveBeenCalled();
    expect(result).toMatchObject({ action: "counter", idempotent: false, offer: { offer_id: "o2", amount: 1350 } });
  });

  it("accepts atomically at or above the floor and reports RESERVED", async () => {
    db.latestOffer = { ...baseOffer, amount: 1250 };
    vi.mocked(acceptOffer).mockResolvedValue({ status: "ACCEPTED", listing_status: "RESERVED", transaction: { tx_id: "tx1", status: "PENDING_CONTACT" } });
    const result = await runSandboxSellerTurn({ buyerAgentId: "judge-agent", judgeAgentId: "judge-agent" });
    expect(acceptOffer).toHaveBeenCalledWith({ offerId: "o1", actorAgentId: "seller-1" });
    expect(result).toMatchObject({ action: "accept", listing_status: "RESERVED", transaction: { tx_id: "tx1" } });
  });

  it("is idempotent while the seller's own counter is open or once accepted", async () => {
    db.latestOffer = { ...baseOffer, offer_id: "o2", amount: 1350, proposed_by_agent_id: "seller-1" };
    const open = await runSandboxSellerTurn({ buyerAgentId: "judge-agent", judgeAgentId: "judge-agent" });
    expect(open).toMatchObject({ action: "counter", idempotent: true, reason: "seller_counter_already_open" });

    db.latestOffer = { ...baseOffer, status: "ACCEPTED" };
    const accepted = await runSandboxSellerTurn({ buyerAgentId: "judge-agent", judgeAgentId: "judge-agent" });
    expect(accepted).toMatchObject({ action: "noop", idempotent: true, listing_status: "RESERVED" });
    expect(counterOffer).not.toHaveBeenCalled();
    expect(acceptOffer).not.toHaveBeenCalled();
  });
});
