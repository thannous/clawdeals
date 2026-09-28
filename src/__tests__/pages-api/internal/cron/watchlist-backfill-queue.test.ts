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
});
