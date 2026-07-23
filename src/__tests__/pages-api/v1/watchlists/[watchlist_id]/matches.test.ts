import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/watchlists", () => ({
  getWatchlistForAgent: vi.fn()
}));

vi.mock("../../../../../server/services/watchlist-matches", () => ({
  decodeWatchlistMatchesCursor: vi.fn().mockReturnValue(null),
  listWatchlistMatches: vi.fn(),
  hydrateDealSummaries: vi.fn(),
  hydrateListingSummaries: vi.fn()
}));

import { handler } from "../../../../../pages/api/v1/watchlists/[watchlist_id]/matches";
import { getWatchlistForAgent } from "../../../../../server/services/watchlists";
import {
  decodeWatchlistMatchesCursor,
  hydrateDealSummaries,
  hydrateListingSummaries,
  listWatchlistMatches
} from "../../../../../server/services/watchlist-matches";

const getWatchlistForAgentMock = vi.mocked(getWatchlistForAgent);
const decodeWatchlistMatchesCursorMock = vi.mocked(decodeWatchlistMatchesCursor);
const listWatchlistMatchesMock = vi.mocked(listWatchlistMatches);
const hydrateDealSummariesMock = vi.mocked(hydrateDealSummaries);
const hydrateListingSummariesMock = vi.mocked(hydrateListingSummaries);

const baseCtx: any = {
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

describe("/v1/watchlists/:watchlist_id/matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET requires agent authentication", async () => {
    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET validates watchlist_id UUID", async () => {
    const req = { method: "GET", query: { watchlist_id: "not-a-uuid", entity_type: "deal" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET validates entity_type", async () => {
    const req = { method: "GET", query: { watchlist_id: "11111111-1111-4111-8111-111111111111" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET validates and forwards the matches cursor", async () => {
    decodeWatchlistMatchesCursorMock.mockReturnValue({
      value: {
        matched_at: "2026-07-23T08:00:00.000Z",
        watchlist_match_id: "match-9"
      }
    } as any);
    getWatchlistForAgentMock.mockResolvedValue({
      watchlist_id: "11111111-1111-4111-8111-111111111111",
      agent_id: "agent-1"
    } as any);
    listWatchlistMatchesMock.mockResolvedValue({ items: [], nextCursor: null } as any);

    const result: any = await handler(
      {
        method: "GET",
        query: {
          watchlist_id: "11111111-1111-4111-8111-111111111111",
          entity_type: "deal",
          limit: "25",
          cursor: "encoded-cursor"
        }
      },
      null,
      { ...baseCtx }
    );

    expect(result.status).toBe(200);
    expect(decodeWatchlistMatchesCursor).toHaveBeenCalledWith("encoded-cursor");
    expect(listWatchlistMatches).toHaveBeenCalledWith({
      watchlistId: "11111111-1111-4111-8111-111111111111",
      entityType: "deal",
      limit: 25,
      cursor: {
        matched_at: "2026-07-23T08:00:00.000Z",
        watchlist_match_id: "match-9"
      }
    });
  });

  it("GET returns 404 when watchlist not found", async () => {
    getWatchlistForAgentMock.mockResolvedValue(null);
    const req = { method: "GET", query: { watchlist_id: "11111111-1111-4111-8111-111111111111", entity_type: "deal" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("GET returns items + next_cursor + deal_summary", async () => {
    getWatchlistForAgentMock.mockResolvedValue({
      watchlist_id: "wl-1",
      agent_id: "agent-1"
    } as any);

    listWatchlistMatchesMock.mockResolvedValue({
      items: [
        {
          watchlist_match_id: "wm-1",
          watchlist_id: "wl-1",
          agent_id: "agent-1",
          entity_type: "deal",
          entity_id: "deal-1",
          matched_at: "2026-02-06T12:00:00Z",
          reason: { tags_matched: ["gpu"] }
        }
      ],
      nextCursor: "cursor-abc"
    } as any);

    hydrateDealSummariesMock.mockResolvedValue(
      new Map([
        [
          "deal-1",
          {
            deal_id: "deal-1",
            title: "RTX 4070 - 399€",
            price: "399.00",
            currency: "EUR",
            expires_at: "2026-02-06T18:00:00Z",
            tags: ["gpu"],
            status: "ACTIVE",
            created_at: "2026-02-06T12:00:00Z"
          }
        ]
      ])
    );

    const ctx: any = { ...baseCtx };
    const req = { method: "GET", query: { watchlist_id: "11111111-1111-4111-8111-111111111111", entity_type: "deal" } };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("watchlist.matches.listed");
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].watchlist_match_id).toBe("wm-1");
    expect(result.body.items[0].deal_summary.deal_id).toBe("deal-1");
    expect(result.body.items[0].deal_summary.price).toBe(399);
    expect(result.body.next_cursor).toBe("cursor-abc");
  });

  it("GET supports entity_type=listing and returns listing_summary", async () => {
    getWatchlistForAgentMock.mockResolvedValue({
      watchlist_id: "wl-1",
      agent_id: "agent-1"
    } as any);

    listWatchlistMatchesMock.mockResolvedValue({
      items: [
        {
          watchlist_match_id: "wm-1",
          watchlist_id: "wl-1",
          agent_id: "agent-1",
          entity_type: "listing",
          entity_id: "listing-1",
          matched_at: "2026-02-06T12:00:00Z",
          reason: { tags_matched: ["electronics"] }
        }
      ],
      nextCursor: "cursor-abc"
    } as any);

    hydrateListingSummariesMock.mockResolvedValue(
      new Map([
        [
          "listing-1",
          {
            listing_id: "listing-1",
            title: "RTX 4070",
            category: "electronics",
            condition: "GOOD",
            price_amount: 399,
            currency: "EUR",
            status: "LIVE",
            created_at: "2026-02-06T12:00:00Z"
          }
        ]
      ])
    );

    const req = { method: "GET", query: { watchlist_id: "11111111-1111-4111-8111-111111111111", entity_type: "listing" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].entity_type).toBe("listing");
    expect(result.body.items[0].listing_summary.listing_id).toBe("listing-1");
    expect(result.body.items[0].deal_summary).toBeNull();
  });
});
