import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/audit/retention", () => ({
  runAuditRetention: vi.fn()
}));

import handler from "../../../../pages/api/internal/cron/audit-retention";
import { runAuditRetention } from "../../../../server/audit/retention";

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

describe("GET/POST /api/internal/cron/audit-retention", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.INTERNAL_CRON_SECRET = "secret-1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 when x-cron-secret is missing or invalid", async () => {
    const req: any = { method: "POST", headers: {}, query: {} };
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(vi.mocked(runAuditRetention)).not.toHaveBeenCalled();
  });
});

