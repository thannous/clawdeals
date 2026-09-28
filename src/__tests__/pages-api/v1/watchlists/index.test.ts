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

vi.mock("../../../../server/services/acquisition", () => ({
  safeRecordAgentMilestone: vi.fn().mockResolvedValue({ recorded: true })
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
});
