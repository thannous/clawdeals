import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dbMocks.getSupabaseServiceClient
}));

import {
  acceptOffer,
  cancelOffer,
  counterOffer,
  createOffer,
  declineOffer,
  listOffersByAgent,
  listOffersByIds,
  mapOfferActionError
} from "./offers";

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

  it("does not access the database when the offer id list normalizes to empty", async () => {
    const client = { from: vi.fn() };
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(listOffersByIds(["", "   ", null as any])).resolves.toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("deduplicates valid offer ids before querying", async () => {
    const query = createQuery({ data: [{ offer_id: "offer-1" }], error: null });
    const client = { from: vi.fn(() => query) };
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    const result = await listOffersByIds(["offer-1", "offer-1", "offer-2"]);

    expect(query.in).toHaveBeenCalledWith("offer_id", ["offer-1", "offer-2"]);
    expect(result).toEqual([{ offer_id: "offer-1" }]);
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

  it("maps a missing previous offer during an atomic counter to 404", async () => {
    const { client } = createRpcClient({
      data: null,
      error: { message: "OFFER_NOT_FOUND" }
    });
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      counterOffer({
        previousOfferId: "missing",
        threadId: "thread-1",
        amount: 300,
        currency: "EUR",
        expiresAt: "2026-07-24T12:00:00.000Z",
        senderId: "buyer-1"
      })
    ).rejects.toMatchObject({ status: 404, code: "OFFER_NOT_FOUND" });
  });

  it.each([
    ["accept", acceptOffer, "offer_accept_v0"],
    ["decline", declineOffer, "offer_decline_v0"],
    ["cancel", cancelOffer, "offer_cancel_v0"]
  ])("executes %s through its atomic RPC", async (_name, action, rpcName) => {
    const row = { offer_id: "offer-1", offer_status: "ACCEPTED" };
    const { client, rpc } = createRpcClient({ data: row, error: null });
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(action({ offerId: "offer-1", actorAgentId: "agent-1" })).resolves.toEqual(row);
    expect(rpc).toHaveBeenCalledWith(rpcName, {
      p_offer_id: "offer-1",
      p_actor_agent_id: "agent-1"
    });
  });

  it("preserves actionable state details from an atomic offer action failure", async () => {
    const { client } = createRpcClient({
      data: null,
      error: { message: "OFFER_NOT_ACTIONABLE:COUNTERED" }
    });
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      acceptOffer({ offerId: "offer-1", actorAgentId: "agent-1" })
    ).rejects.toMatchObject({
      status: 409,
      code: "OFFER_NOT_ACTIONABLE",
      details: { status: "COUNTERED" }
    });
  });

  it("clamps pagination, applies filters, and emits a stable next cursor", async () => {
    const rows = [
      { offer_id: "offer-3", created_at: "2026-07-23T12:03:00.000Z" },
      { offer_id: "offer-2", created_at: "2026-07-23T12:02:00.000Z" },
      { offer_id: "offer-1", created_at: "2026-07-23T12:01:00.000Z" }
    ];
    const query = createQuery({ data: rows, error: null });
    const client = { from: vi.fn(() => query) };
    dbMocks.getSupabaseServiceClient.mockReturnValue(client);

    const result = await listOffersByAgent({
      agentIds: ["agent-1", "", "agent-2"],
      status: "CREATED",
      limit: 2,
      cursor: {
        created_at: "2026-07-23T12:04:00.000Z",
        offer_id: "offer-4"
      }
    });

    expect(query.or).toHaveBeenCalledWith(
      'buyer_agent_id.in.("agent-1","agent-2"),seller_agent_id.in.("agent-1","agent-2")'
    );
    expect(query.eq).toHaveBeenCalledWith("status", "CREATED");
    expect(query.limit).toHaveBeenCalledWith(3);
    expect(query.or).toHaveBeenCalledWith(
      'created_at.lt."2026-07-23T12:04:00.000Z",and(created_at.eq."2026-07-23T12:04:00.000Z",offer_id.lt."offer-4")'
    );
    expect(result.items).toEqual(rows.slice(0, 2));
    expect(JSON.parse(Buffer.from(result.nextCursor!, "base64").toString("utf8"))).toEqual({
      created_at: "2026-07-23T12:02:00.000Z",
      offer_id: "offer-2"
    });
  });

  it("falls back to the shared database error mapping", () => {
    expect(mapOfferActionError({ message: "database unavailable" })).toEqual({
      status: 500,
      code: "DATABASE_ERROR",
      message: "database unavailable"
    });
  });
});
