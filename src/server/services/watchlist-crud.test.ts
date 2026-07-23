import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import {
  createWatchlist,
  getWatchlistForAgent,
  MAX_ACTIVE_WATCHLISTS,
  updateWatchlistForAgent
} from "./watchlists";

function createAwaitableQuery(result: any) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    then: vi.fn((resolve: any) => Promise.resolve(resolve(result)))
  };
  return query;
}

function createMaybeSingleQuery(result: any) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result)
  };
  return query;
}

describe("watchlist CRUD service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists an explicit ES market independently from its shared EUR currency", async () => {
    const countQuery = createAwaitableQuery({ count: 12, error: null });
    let insertedPayload: any;
    const insertQuery: any = {
      insert: vi.fn((payload: any) => {
        insertedPayload = payload;
        return insertQuery;
      }),
      select: vi.fn(() => insertQuery),
      single: vi.fn(async () => ({
        data: {
          watchlist_id: "wl-es",
          ...insertedPayload,
          created_at: "2026-07-23T08:00:00.000Z"
        },
        error: null
      }))
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(countQuery)
      .mockReturnValueOnce(insertQuery);
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from } as any);

    const result = await createWatchlist({
      agentId: "agent-1",
      name: "Spanish consoles",
      active: true,
      criteria: { query: "console" },
      queryText: "console",
      tags: ["gaming"],
      priceMax: 400,
      marketCode: "ES",
      currency: "EUR",
      geoLat: null,
      geoLon: null,
      distanceKm: null
    });

    expect(from).toHaveBeenNthCalledWith(1, "watchlists");
    expect(countQuery.select).toHaveBeenCalledWith("watchlist_id", { count: "exact", head: true });
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: "agent-1",
        active: true,
        market_code: "ES",
        currency: "EUR",
        query_text: "console",
        tags: ["gaming"],
        price_max: 400
      })
    );
    expect(result).toMatchObject({
      watchlist_id: "wl-es",
      market_code: "ES",
      currency: "EUR"
    });
  });

  it("blocks creation when the active watchlist quota is reached", async () => {
    const countQuery = createAwaitableQuery({ count: MAX_ACTIVE_WATCHLISTS, error: null });
    const from = vi.fn(() => countQuery);
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from } as any);

    await expect(
      createWatchlist({
        agentId: "agent-1",
        active: true,
        marketCode: "FR",
        currency: "EUR"
      } as any)
    ).rejects.toMatchObject({
      message: "Watchlist limit reached",
      status: 409,
      code: "WATCHLIST_LIMIT_REACHED",
      isBlocked: true,
      reason: "quota",
      activeLimit: MAX_ACTIVE_WATCHLISTS
    });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("updates market_code and currency atomically for the owning agent", async () => {
    const existing = {
      watchlist_id: "wl-1",
      agent_id: "agent-1",
      active: true,
      market_code: "FR",
      currency: "EUR",
      deleted_at: null
    };
    const lookupQuery = createMaybeSingleQuery({ data: existing, error: null });
    let updatePayload: any;
    const updateQuery: any = {
      update: vi.fn((payload: any) => {
        updatePayload = payload;
        return updateQuery;
      }),
      eq: vi.fn(() => updateQuery),
      is: vi.fn(() => updateQuery),
      select: vi.fn(() => updateQuery),
      maybeSingle: vi.fn(async () => ({
        data: { ...existing, ...updatePayload },
        error: null
      }))
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(lookupQuery)
      .mockReturnValueOnce(updateQuery);
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from } as any);

    const result = await updateWatchlistForAgent({
      watchlistId: "wl-1",
      agentId: "agent-1",
      patch: { marketCode: "GB", currency: "GBP" }
    });

    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        market_code: "GB",
        currency: "GBP"
      })
    );
    expect(updateQuery.eq).toHaveBeenCalledWith("watchlist_id", "wl-1");
    expect(updateQuery.eq).toHaveBeenCalledWith("agent_id", "agent-1");
    expect(result).toMatchObject({ market_code: "GB", currency: "GBP" });
  });

  it("does not reveal a watchlist owned by another agent", async () => {
    const lookupQuery = createMaybeSingleQuery({
      data: {
        watchlist_id: "wl-private",
        agent_id: "agent-owner",
        active: true,
        deleted_at: null
      },
      error: null
    });
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => lookupQuery)
    } as any);

    await expect(
      getWatchlistForAgent({
        watchlistId: "wl-private",
        agentId: "agent-other"
      })
    ).rejects.toMatchObject({
      message: "Watchlist not found",
      status: 404,
      code: "NOT_FOUND",
      isBlocked: true,
      reason: "authz"
    });
  });
});
