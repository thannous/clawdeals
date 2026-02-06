import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/watchlists", () => ({
  createWatchlist: vi.fn(),
  listWatchlists: vi.fn(),
  decodeWatchlistCursor: vi.fn().mockReturnValue(null),
  WATCHLISTS_DEFAULT_LIMIT: 50,
  WATCHLISTS_MAX_LIMIT: 100
}));

import { handler } from "./index";
import { createWatchlist, decodeWatchlistCursor, listWatchlists } from "../../../../server/services/watchlists";

const baseCtx = {
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

describe("/v1/watchlists (index)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET requires agent authentication", async () => {
    const req = { method: "GET", query: {} };
    const result = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET validates cursor", async () => {
    decodeWatchlistCursor.mockReturnValue({ error: "Invalid cursor" });

    const req = { method: "GET", query: { cursor: "bad" } };
    const result = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET returns items + next_cursor", async () => {
    listWatchlists.mockResolvedValue({
      items: [
        {
          watchlist_id: "wl-1",
          agent_id: "agent-1",
          name: "GPU deals",
          active: true,
          criteria: { query: "rtx", tags: ["gpu"], price_max: null, geo: null, distance_km: null },
          created_at: "2026-02-06T12:00:00Z",
          updated_at: "2026-02-06T12:00:00Z"
        }
      ],
      nextCursor: "cursor-abc"
    });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: {} };
    const result = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("watchlists.listed");
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].watchlist_id).toBe("wl-1");
    expect(result.body.next_cursor).toBe("cursor-abc");
    expect(listWatchlists).toHaveBeenCalledWith({
      agentId: "agent-1",
      active: true,
      limit: 50,
      cursor: null
    });
  });

  it("POST requires Idempotency-Key", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: { criteria: { tags: ["gpu"] }, active: true }
    };
    const result = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(String(result.body.error.message)).toContain("Idempotency-Key");
  });

  it("POST validates criteria: distance_km without geo", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { criteria: { tags: ["gpu"], distance_km: 10 }, active: true }
    };
    const result = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST normalizes empty query to null", async () => {
    createWatchlist.mockResolvedValue({
      watchlist_id: "wl-1",
      agent_id: "agent-1",
      name: "GPU deals",
      active: true,
      criteria: { query: null, tags: ["gpu"], price_max: null, geo: null, distance_km: null },
      created_at: "2026-02-06T12:00:00Z",
      updated_at: "2026-02-06T12:00:00Z"
    });

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { name: "GPU deals", criteria: { query: "   ", tags: ["GPU"] }, active: true }
    };
    const result = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(createWatchlist).toHaveBeenCalledWith(
      expect.objectContaining({
        criteria: expect.objectContaining({ query: null }),
        tags: ["gpu"]
      })
    );
  });
});

