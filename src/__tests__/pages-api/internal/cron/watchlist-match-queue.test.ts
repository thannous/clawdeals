import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/watchlist-match-queue", () => ({
  runWatchlistMatchQueue: vi.fn()
}));

import handler from "../../../../pages/api/internal/cron/watchlist-match-queue";
import { runWatchlistMatchQueue } from "../../../../server/services/watchlist-match-queue";

function createMockRes() {
  let statusCode: number | null = null;
  let jsonBody: any = null;
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((body: any) => {
      jsonBody = body;
      return res;
    }),
    _status: () => statusCode,
    _json: () => jsonBody
  };
  return res;
}

describe("GET/POST /api/internal/cron/watchlist-match-queue", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, INTERNAL_CRON_SECRET: "secret-1" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 without the internal cron secret", async () => {
    const req: any = { method: "POST", headers: {}, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(runWatchlistMatchQueue).not.toHaveBeenCalled();
  });
});
