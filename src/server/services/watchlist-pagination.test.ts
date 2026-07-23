import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { decodeWatchlistMatchesCursor, listWatchlistMatches } from "./watchlist-matches";
import { decodeWatchlistCursor, listWatchlists } from "./watchlists";

function createQuery(data: any[]) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    or: vi.fn(() => query),
    then: vi.fn((resolve: any) => Promise.resolve(resolve({ data, error: null })))
  };
  return query;
}

describe("watchlist service pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the created_at/id tie-breaker and builds the next watchlist cursor from the visible page", async () => {
    const rows = [
      {
        watchlist_id: "wl-3",
        agent_id: "agent-1",
        active: true,
        created_at: "2026-07-23T08:03:00.000Z"
      },
      {
        watchlist_id: "wl-2",
        agent_id: "agent-1",
        active: true,
        created_at: "2026-07-23T08:02:00.000Z"
      },
      {
        watchlist_id: "wl-1",
        agent_id: "agent-1",
        active: true,
        created_at: "2026-07-23T08:01:00.000Z"
      }
    ];
    const query = createQuery(rows);
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => query)
    } as any);

    const result = await listWatchlists({
      agentId: "agent-1",
      active: true,
      limit: 2,
      cursor: {
        created_at: "2026-07-23T09:00:00.000Z",
        watchlist_id: "wl-9"
      }
    });

    expect(query.eq).toHaveBeenCalledWith("agent_id", "agent-1");
    expect(query.eq).toHaveBeenCalledWith("active", true);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.limit).toHaveBeenCalledWith(3);
    expect(query.or).toHaveBeenCalledWith(
      'created_at.lt."2026-07-23T09:00:00.000Z",and(created_at.eq."2026-07-23T09:00:00.000Z",watchlist_id.lt."wl-9")'
    );
    expect(result.items.map((row) => row.watchlist_id)).toEqual(["wl-3", "wl-2"]);
    expect(decodeWatchlistCursor(result.nextCursor)?.value).toEqual({
      created_at: "2026-07-23T08:02:00.000Z",
      watchlist_id: "wl-2"
    });
  });

  it("paginates matches independently by entity type and derives the cursor from the last visible match", async () => {
    const rows = [
      {
        watchlist_match_id: "match-3",
        watchlist_id: "wl-1",
        entity_type: "listing",
        entity_id: "listing-3",
        matched_at: "2026-07-23T08:03:00.000Z"
      },
      {
        watchlist_match_id: "match-2",
        watchlist_id: "wl-1",
        entity_type: "listing",
        entity_id: "listing-2",
        matched_at: "2026-07-23T08:02:00.000Z"
      },
      {
        watchlist_match_id: "match-1",
        watchlist_id: "wl-1",
        entity_type: "listing",
        entity_id: "listing-1",
        matched_at: "2026-07-23T08:01:00.000Z"
      }
    ];
    const query = createQuery(rows);
    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => query)
    } as any);

    const result = await listWatchlistMatches({
      watchlistId: "wl-1",
      entityType: "listing",
      limit: 2,
      cursor: {
        matched_at: "2026-07-23T09:00:00.000Z",
        watchlist_match_id: "match-9"
      }
    });

    expect(query.eq).toHaveBeenCalledWith("watchlist_id", "wl-1");
    expect(query.eq).toHaveBeenCalledWith("entity_type", "listing");
    expect(query.limit).toHaveBeenCalledWith(3);
    expect(query.or).toHaveBeenCalledWith(
      'matched_at.lt."2026-07-23T09:00:00.000Z",and(matched_at.eq."2026-07-23T09:00:00.000Z",watchlist_match_id.lt."match-9")'
    );
    expect(result.items.map((row) => row.watchlist_match_id)).toEqual(["match-3", "match-2"]);
    expect(decodeWatchlistMatchesCursor(result.nextCursor)?.value).toEqual({
      matched_at: "2026-07-23T08:02:00.000Z",
      watchlist_match_id: "match-2"
    });
  });
});
