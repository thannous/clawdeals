import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/risk-rules", () => ({
  runRiskRulesEngine: vi.fn()
}));

import handler from "../../../../pages/api/internal/cron/risk-rules";
import { runRiskRulesEngine } from "../../../../server/services/risk-rules";

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

describe("GET/POST /api/internal/cron/risk-rules", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, INTERNAL_CRON_SECRET: "secret-1" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 without secret", async () => {
    const req: any = { method: "POST", headers: {}, body: {} };
    const res = createMockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 405 for unsupported method", async () => {
    const req: any = { method: "DELETE", headers: { "x-cron-secret": "secret-1" }, body: {} };
    const res = createMockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("validates dry_run", async () => {
    const req: any = { method: "POST", headers: { "x-cron-secret": "secret-1" }, body: { dry_run: "wat" } };
    const res = createMockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("runs engine", async () => {
    vi.mocked(runRiskRulesEngine).mockResolvedValue({ rules_scanned: 1 } as any);
    const req: any = {
      method: "POST",
      headers: { "x-cron-secret": "secret-1" },
      body: { dry_run: true, rule_key: "rate_limit_triggers_1h", max_agents_per_rule: 20 }
    };
    const res = createMockRes();
    await handler(req, res);

    expect(runRiskRulesEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        ruleKey: "rate_limit_triggers_1h",
        maxAgentsPerRule: 20
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

