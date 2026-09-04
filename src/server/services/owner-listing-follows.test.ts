import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: vi.fn() }));
vi.mock("./agents", () => ({ getAgentIdByOwnerId: vi.fn() }));
vi.mock("./listings", () => ({ getListing: vi.fn() }));
vi.mock("./watchlists", () => ({
  createWatchlist: vi.fn(),
  deleteWatchlistForAgent: vi.fn(),
  getWatchlistForAgent: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { getAgentIdByOwnerId } from "./agents";
import { getListing } from "./listings";
import { createWatchlist, deleteWatchlistForAgent, getWatchlistForAgent } from "./watchlists";
import { createOwnerListingFollow, deleteOwnerListingFollow, listOwnerListingFollows } from "./owner-listing-follows";

function listingFollowQuery(rows: any[]) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    contains: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: vi.fn((resolve: any) => Promise.resolve(resolve({ data: rows, error: null })))
  };
  return query;
}

describe("owner listing follows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAgentIdByOwnerId).mockResolvedValue("agent-1");
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => listingFollowQuery([]))
    } as any);
  });

  it("creates an exact listing watchlist with the current price as its baseline", async () => {
    vi.mocked(getListing).mockResolvedValue({
      listing_id: "listing-1",
      status: "LIVE",
      title: "Paris bike",
      price_amount: 1150,
      currency: "EUR",
      market_code: "FR"
    } as any);
    vi.mocked(createWatchlist).mockResolvedValue({
      watchlist_id: "watchlist-1",
      name: "Price drop: Paris bike",
      active: true,
      criteria: {
        kind: "listing_follow",
        listing_id: "listing-1",
        listing_title: "Paris bike",
        last_price: 1150
      },
      market_code: "FR",
      currency: "EUR"
    } as any);

    const result = await createOwnerListingFollow({ ownerId: "owner-1", listingId: "listing-1" });

    expect(createWatchlist).toHaveBeenCalledWith(expect.objectContaining({
      agentId: "agent-1",
      queryText: null,
      tags: [],
      priceMax: null,
      criteria: expect.objectContaining({
        kind: "listing_follow",
        listing_id: "listing-1",
        last_price: 1150
      })
    }));
    expect(result).toMatchObject({ watchlist_id: "watchlist-1", listing_id: "listing-1", created: true });
  });

  it("returns no owner follows when the account has no connected agent", async () => {
    vi.mocked(getAgentIdByOwnerId).mockResolvedValue(null);
    await expect(listOwnerListingFollows({ ownerId: "owner-1" })).resolves.toEqual([]);
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("requires an agent before creating a server follow", async () => {
    vi.mocked(getAgentIdByOwnerId).mockResolvedValue(null);
    vi.mocked(getListing).mockResolvedValue({ status: "LIVE" } as any);
    await expect(createOwnerListingFollow({ ownerId: "owner-1", listingId: "listing-1" })).rejects.toMatchObject({
      code: "AGENT_REQUIRED",
      status: 409
    });
  });

  it("deletes only an exact listing-follow watchlist owned by the account agent", async () => {
    vi.mocked(getWatchlistForAgent).mockResolvedValue({
      watchlist_id: "watchlist-1",
      criteria: { kind: "listing_follow", listing_id: "listing-1" }
    } as any);
    vi.mocked(deleteWatchlistForAgent).mockResolvedValue({
      watchlist_id: "watchlist-1",
      active: false,
      criteria: { kind: "listing_follow", listing_id: "listing-1" }
    } as any);

    await expect(deleteOwnerListingFollow({ ownerId: "owner-1", watchlistId: "watchlist-1" })).resolves.toMatchObject({
      watchlist_id: "watchlist-1",
      listing_id: "listing-1",
      active: false
    });
    expect(deleteWatchlistForAgent).toHaveBeenCalledWith(expect.objectContaining({ agentId: "agent-1" }));
  });
});
