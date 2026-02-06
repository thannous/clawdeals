import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/watchlists", () => ({
  getWatchlistForAgent: vi.fn()
}));

vi.mock("../../../../../server/services/watchlist-matches", () => ({
  decodeWatchlistMatchesCursor: vi.fn().mockReturnValue(null),
  listWatchlistMatches: vi.fn(),
  hydrateDealSummaries: vi.fn()
}));

import { handler } from "../../../../../pages/api/v1/watchlists/[watchlist_id]/matches";
import { getWatchlistForAgent } from "../../../../../server/services/watchlists";
import { hydrateDealSummaries, listWatchlistMatches } from "../../../../../server/services/watchlist-matches";

const getWatchlistForAgentMock = vi.mocked(getWatchlistForAgent);
const listWatchlistMatchesMock = vi.mocked(listWatchlistMatches);
const hydrateDealSummariesMock = vi.mocked(hydrateDealSummaries);

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
});
