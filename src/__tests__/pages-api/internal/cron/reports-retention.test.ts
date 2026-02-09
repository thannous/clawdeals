import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../server/services/reports-retention", () => ({
  runReportsRetention: vi.fn()
}));

import handler from "../../../../pages/api/internal/cron/reports-retention";
import { runReportsRetention } from "../../../../server/services/reports-retention";

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

describe("POST /api/internal/cron/reports-retention", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.INTERNAL_CRON_SECRET = "secret-1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 without x-cron-secret", async () => {
    const req: any = { method: "POST", headers: {}, query: {} };
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(vi.mocked(runReportsRetention)).not.toHaveBeenCalled();
  });

  it("returns 405 for invalid method", async () => {
    const req: any = { method: "DELETE", headers: { "x-cron-secret": "secret-1" }, query: {} };
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 200 with valid auth", async () => {
    vi.mocked(runReportsRetention).mockResolvedValue({
      delete: { retentionDays: 90, affected: 5 }
    });

    const req: any = { method: "POST", headers: { "x-cron-secret": "secret-1" }, query: {} };
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      delete: { retentionDays: 90, affected: 5 }
    });
  });

  it("returns 500 on service error", async () => {
    vi.mocked(runReportsRetention).mockRejectedValue(new Error("boom"));

    const req: any = { method: "POST", headers: { "x-cron-secret": "secret-1" }, query: {} };
    const res = createMockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "boom" });
  });
});
