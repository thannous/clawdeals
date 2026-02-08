import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../server/trustscore/recalc-queue", () => ({
  runTrustScoreRecalcQueue: vi.fn()
}));

import handler from "../../../../pages/api/internal/cron/trustscore-recalc-queue";
import { runTrustScoreRecalcQueue } from "../../../../server/trustscore/recalc-queue";

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

describe("POST /api/internal/cron/trustscore-recalc-queue", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.INTERNAL_CRON_SECRET = "secret-1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("does not authorize based on spoofable User-Agent (even if env var is set)", async () => {
    process.env.ALLOW_VERCEL_CRON_USER_AGENT = "true";
    const req: any = {
      method: "POST",
      headers: { "user-agent": "vercel-cron/1.0" },
      query: {}
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(vi.mocked(runTrustScoreRecalcQueue)).not.toHaveBeenCalled();
  });

  it("authorizes with x-cron-secret header and forwards limit", async () => {
    vi.mocked(runTrustScoreRecalcQueue).mockResolvedValue({
      scanned: 1,
      updated: 0,
      skipped: 1,
      errors: 0
    });

    const req: any = {
      method: "POST",
      headers: { "x-cron-secret": "secret-1" },
      query: { limit: "2" }
    };
    const res = createMockRes();

    await handler(req, res);

    expect(vi.mocked(runTrustScoreRecalcQueue)).toHaveBeenCalledWith({ limit: 2 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      scanned: 1,
      updated: 0,
      skipped: 1,
      errors: 0
    });
  });
});

