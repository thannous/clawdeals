import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/observability/alerts", () => ({
  runObservabilityAlerts: vi.fn()
}));

import handler from "../../../../pages/api/internal/cron/observability-alerts";
import { runObservabilityAlerts } from "../../../../server/observability/alerts";

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

describe("GET/POST /api/internal/cron/observability-alerts", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.INTERNAL_CRON_SECRET = "secret-1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 405 for unsupported methods", async () => {
    const req: any = { method: "PUT", headers: {}, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("Allow", "GET, POST");
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: "Method not allowed" });
    expect(vi.mocked(runObservabilityAlerts)).not.toHaveBeenCalled();
  });

  it("returns 401 when x-cron-secret is missing or invalid", async () => {
    const req: any = { method: "POST", headers: {}, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(vi.mocked(runObservabilityAlerts)).not.toHaveBeenCalled();
  });

  it("runs alert checks and returns 200 when authorized", async () => {
    vi.mocked(runObservabilityAlerts).mockResolvedValue({ ok: true, alerts: [] } as any);

    const req: any = { method: "GET", headers: { "x-cron-secret": "secret-1" }, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(vi.mocked(runObservabilityAlerts)).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, alerts: [] });
  });

  it("returns 500 when alert checks throw", async () => {
    vi.mocked(runObservabilityAlerts).mockRejectedValue(new Error("boom"));

    const req: any = { method: "POST", headers: { "x-cron-secret": "secret-1" }, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "boom" });
  });
});

