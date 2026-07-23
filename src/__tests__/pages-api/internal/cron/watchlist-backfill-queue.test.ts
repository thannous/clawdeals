import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/watchlist-backfill-queue", () => ({
  runWatchlistBackfillQueue: vi.fn()
}));

import handler from "../../../../pages/api/internal/cron/watchlist-backfill-queue";
import { runWatchlistBackfillQueue } from "../../../../server/services/watchlist-backfill-queue";

function createMockRes() {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(() => res),
    json: vi.fn(() => res)
  };
  return res;
}

describe("GET/POST /api/internal/cron/watchlist-backfill-queue", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, INTERNAL_CRON_SECRET: "secret-1" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects requests without the internal cron secret", async () => {
    const res = createMockRes();

    await handler({ method: "POST", headers: {}, query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(runWatchlistBackfillQueue).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods before running the queue", async () => {
    const res = createMockRes();

    await handler({ method: "DELETE", headers: { "x-cron-secret": "secret-1" }, query: {} }, res);

    expect(res.setHeader).toHaveBeenCalledWith("Allow", "GET, POST");
    expect(res.status).toHaveBeenCalledWith(405);
    expect(runWatchlistBackfillQueue).not.toHaveBeenCalled();
  });

  it("forwards bounded queue and entity limits", async () => {
    vi.mocked(runWatchlistBackfillQueue).mockResolvedValue({
      ok: true,
      processed_count: 2,
      inserted_count: 5
    } as any);
    const res = createMockRes();

    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer secret-1" },
        query: {
          limit: ["3", "ignored"],
          deals_limit: "250",
          listings_limit: "125"
        }
      },
      res
    );

    expect(runWatchlistBackfillQueue).toHaveBeenCalledWith({
      limit: 3,
      dealsLimit: 250,
      listingsLimit: 125
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      processed_count: 2,
      inserted_count: 5
    });
  });

  it("omits invalid limits and returns queue failures as 500", async () => {
    vi.mocked(runWatchlistBackfillQueue).mockRejectedValue(new Error("database unavailable"));
    const res = createMockRes();

    await handler(
      {
        method: "POST",
        headers: { "x-cron-secret": "secret-1" },
        query: { limit: "0", deals_limit: "invalid", listings_limit: "-1" }
      },
      res
    );

    expect(runWatchlistBackfillQueue).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "database unavailable" });
  });
});
