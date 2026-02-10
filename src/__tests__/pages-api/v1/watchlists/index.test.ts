import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/watchlists", () => ({
  createWatchlist: vi.fn(),
  listWatchlists: vi.fn(),
  decodeWatchlistCursor: vi.fn().mockReturnValue(null),
  WATCHLISTS_DEFAULT_LIMIT: 50,
  WATCHLISTS_MAX_LIMIT: 100
}));

vi.mock("../../../../server/services/watchlist-backfill-queue", () => ({
  enqueueWatchlistBackfill: vi.fn().mockResolvedValue({ ok: true })
}));

import { handler } from "../../../../pages/api/v1/watchlists/index";
import { createWatchlist, decodeWatchlistCursor, listWatchlists } from "../../../../server/services/watchlists";
import { enqueueWatchlistBackfill } from "../../../../server/services/watchlist-backfill-queue";

const createWatchlistMock = vi.mocked(createWatchlist);
const listWatchlistsMock = vi.mocked(listWatchlists);
const decodeWatchlistCursorMock = vi.mocked(decodeWatchlistCursor);
const enqueueWatchlistBackfillMock = vi.mocked(enqueueWatchlistBackfill);

const baseCtx: any = {
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
    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET validates cursor", async () => {
    decodeWatchlistCursorMock.mockReturnValue({ error: "Invalid cursor" } as any);

    const req = { method: "GET", query: { cursor: "bad" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET returns items + next_cursor", async () => {
    listWatchlistsMock.mockResolvedValue({
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
    } as any);

    const ctx: any = { ...baseCtx };
    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, ctx);
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

  it("GET passes decoded cursor into listWatchlists (pagination)", async () => {
    decodeWatchlistCursorMock.mockReturnValue({
      value: { created_at: "2026-02-01T00:00:00Z", watchlist_id: "wl-0" }
    } as any);

    listWatchlistsMock.mockResolvedValue({
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
      nextCursor: null
    } as any);

    const req = { method: "GET", query: { cursor: "cursor-encoded", limit: "1" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.next_cursor).toBeNull();
    expect(decodeWatchlistCursor).toHaveBeenCalledWith("cursor-encoded");
    expect(listWatchlists).toHaveBeenCalledWith({
      agentId: "agent-1",
      active: true,
      limit: 1,
      cursor: { created_at: "2026-02-01T00:00:00Z", watchlist_id: "wl-0" }
    });
  });

  it("GET rejects non-integer limit encodings", async () => {
    const req1 = { method: "GET", query: { limit: "10.5" } };
    const res1: any = await handler(req1, null, { ...baseCtx });
    expect(res1.status).toBe(400);
    expect(res1.body.error.code).toBe("VALIDATION_ERROR");
    expect(res1.body.error.message).toBe("limit must be an integer");

    const req2 = { method: "GET", query: { limit: "10abc" } };
    const res2: any = await handler(req2, null, { ...baseCtx });
    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe("VALIDATION_ERROR");
    expect(res2.body.error.message).toBe("limit must be an integer");
  });

  it("POST requires Idempotency-Key", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: { criteria: { tags: ["gpu"] }, active: true }
    };
    const result: any = await handler(req, null, { ...baseCtx });
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
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST validates criteria: distance_km must be an integer", async () => {
    const req1 = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { criteria: { tags: ["gpu"], geo: { lat: 1, lon: 2 }, distance_km: 10.5 }, active: true }
    };
    const res1: any = await handler(req1, null, { ...baseCtx });
    expect(res1.status).toBe(400);
    expect(res1.body.error.code).toBe("VALIDATION_ERROR");
    expect(res1.body.error.message).toBe("criteria.distance_km must be an integer");

    const req2 = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { criteria: { tags: ["gpu"], geo: { lat: 1, lon: 2 }, distance_km: "10km" }, active: true }
    };
    const res2: any = await handler(req2, null, { ...baseCtx });
    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe("VALIDATION_ERROR");
    expect(res2.body.error.message).toBe("criteria.distance_km must be an integer");
  });

  it("POST normalizes empty query to null", async () => {
    createWatchlistMock.mockResolvedValue({
      watchlist_id: "wl-1",
      agent_id: "agent-1",
      name: "GPU deals",
      active: true,
      criteria: { query: null, tags: ["gpu"], price_max: null, geo: null, distance_km: null },
      created_at: "2026-02-06T12:00:00Z",
      updated_at: "2026-02-06T12:00:00Z"
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { name: "GPU deals", criteria: { query: "   ", tags: ["GPU"] }, active: true }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(createWatchlist).toHaveBeenCalledWith(
      expect.objectContaining({
        criteria: expect.objectContaining({ query: null }),
        tags: ["gpu"]
      })
    );
    expect(enqueueWatchlistBackfillMock).toHaveBeenCalledWith({ watchlistId: "wl-1" });
  });
});
