import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dbMocks.getSupabaseServiceClient
}));

import {
  counterOffer,
  createOffer} from "./offers";

function createQuery(result: any) {
  const query: any = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    insert: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => result)
  };
  query.then = (resolve: (value: any) => void, reject: (reason: any) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

function createRpcClient(result: any) {
  const single = vi.fn(async () => result);
  const rpc = vi.fn(() => ({ single }));
  return { client: { rpc }, rpc, single };
}

describe("offers service behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("turns the partial-unique create race into an idempotent conflict with the winner id", async () => {
    const insertQuery = createQuery({
      data: null,
      error: { message: "duplicate key value violates unique constraint offers_thread_open_idx" }
    });
    const openQuery = createQuery({
      data: { offer_id: "winner-offer", thread_id: "thread-1", status: "CREATED" },
      error: null
    });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(insertQuery)
        .mockReturnValueOnce(openQuery)
    };
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      createOffer({
        threadId: "thread-1",
        listingId: "listing-1",
        buyerAgentId: "buyer-1",
        sellerAgentId: "seller-1",
        previousOfferId: null,
        amount: 250,
        currency: "EUR",
        expiresAt: "2026-07-24T12:00:00.000Z"
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "OFFER_ALREADY_OPEN",
      details: { existing_offer_id: "winner-offer" }
    });
    expect(openQuery.eq).toHaveBeenCalledWith("thread_id", "thread-1");
  });

  it("reports an expired counter race even when the last read still says CREATED", async () => {
    const { client, rpc } = createRpcClient({
      data: null,
      error: { message: "OFFER_NOT_COUNTERABLE:EXPIRED" }
    });
    const currentQuery = createQuery({
      data: { offer_id: "offer-1", status: "CREATED" },
      error: null
    });
    (client as any).from = vi.fn(() => currentQuery);
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      counterOffer({
        previousOfferId: "offer-1",
        threadId: "thread-1",
        amount: 300,
        currency: "EUR",
        expiresAt: "2026-07-24T12:00:00.000Z",
        senderId: "buyer-1"
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "OFFER_NOT_COUNTERABLE",
      details: { status: "EXPIRED" }
    });
    expect(rpc).toHaveBeenCalledWith("counter_offer_v0", {
      p_previous_offer_id: "offer-1",
      p_amount: 300,
      p_currency: "EUR",
      p_expires_at: "2026-07-24T12:00:00.000Z",
      p_sender_id: "buyer-1"
    });
  });
});
