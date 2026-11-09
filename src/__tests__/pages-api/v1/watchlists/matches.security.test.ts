import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/watchlists", () => ({ getWatchlistForAgent: vi.fn() }));
vi.mock("../../../../server/services/watchlist-matches", () => ({
  listWatchlistMatches: vi.fn(),
  hydrateDealSummaries: vi.fn(),
  hydrateListingSummaries: vi.fn(),
  decodeWatchlistMatchesCursor: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/watchlists/[watchlist_id]/matches";
import { getWatchlistForAgent } from "../../../../server/services/watchlists";
import { hydrateDealSummaries, hydrateListingSummaries, listWatchlistMatches } from "../../../../server/services/watchlist-matches";

const watchlistId = "11111111-1111-4111-8111-111111111111";
const ctx: any = { agentId: "agent-1", actor: { type: "agent", id: "agent-1" }, authError: null };
const row = { watchlist_match_id: "match-1", watchlist_id: watchlistId, entity_type: "listing",
  entity_id: "listing-1", matched_at: "2026-11-01T00:00:00Z", reason: { geo_km: 0.5123, geo_ok: true } };

describe("watchlist match read visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWatchlistForAgent).mockResolvedValue({ watchlist_id: watchlistId, geo_lat: 48.86, geo_lon: 2.35, distance_km: 0.1 } as any);
    vi.mocked(listWatchlistMatches).mockResolvedValue({ items: [row], nextCursor: null } as any);
  });

  async function read(entityType: string) {
    return handler({ method: "GET", query: { watchlist_id: watchlistId, entity_type: entityType } }, null, { ...ctx }) as any;
  }

  it("does not return old matches for hidden listings or deals", async () => {
    vi.mocked(hydrateListingSummaries).mockResolvedValue(new Map() as any);
    expect((await read("listing")).body.items).toEqual([]);
    vi.mocked(listWatchlistMatches).mockResolvedValue({ items: [{ ...row, entity_type: "deal", entity_id: "deal-1" }], nextCursor: null } as any);
    vi.mocked(hydrateDealSummaries).mockResolvedValue(new Map() as any);
    expect((await read("deal")).body.items).toEqual([]);
  });

  it("replaces a stored exact distance with the public rounded distance", async () => {
    vi.mocked(hydrateListingSummaries).mockResolvedValue(new Map([["listing-1", {
      listing_id: "listing-1", title: "Bike", status: "LIVE", geo_lat: 48.8649, geo_lng: 2.3549
    }]]) as any);
    const response = await read("listing");
    expect(response.status).toBe(200);
    expect(response.body.items[0].reason.geo_km).toBe(0);
  });

  it("drops a historical exact match outside the current rounded radius", async () => {
    vi.mocked(hydrateListingSummaries).mockResolvedValue(new Map([["listing-1", {
      listing_id: "listing-1", title: "Bike", status: "LIVE", geo_lat: 48.8651, geo_lng: 2.35
    }]]) as any);
    expect((await read("listing")).body.items).toEqual([]);
  });
});
