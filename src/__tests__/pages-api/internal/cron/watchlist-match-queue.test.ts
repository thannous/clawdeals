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

  it("returns 405 for unsupported methods", async () => {
    const req: any = { method: "DELETE", headers: { "x-cron-secret": "secret-1" }, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("Allow", "GET, POST");
    expect(res.status).toHaveBeenCalledWith(405);
    expect(runWatchlistMatchQueue).not.toHaveBeenCalled();
  });

  it("authorizes with x-cron-secret and forwards limit", async () => {
    vi.mocked(runWatchlistMatchQueue).mockResolvedValue({
      ok: true,
      scanned_count: 1,
      processed_count: 1,
      success_count: 1,
      skipped_count: 0,
      error_count: 0,
      matched_count: 2,
      inserted_count: 1,
      markets: { FR: { processed_count: 1, error_count: 0, matched_count: 2, inserted_count: 1 } }
    });

    const req: any = {
      method: "GET",
      headers: { "x-cron-secret": "secret-1" },
      query: { limit: "2" }
    };
    const res = createMockRes();

    await handler(req, res);

    expect(runWatchlistMatchQueue).toHaveBeenCalledWith({ limit: 2 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        processed_count: 1
      })
    );
  });
});
