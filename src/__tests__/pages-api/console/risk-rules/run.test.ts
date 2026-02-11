import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/risk-rules", () => ({
  runRiskRulesEngine: vi.fn()
}));

import { handler } from "../../../../pages/api/console/risk-rules/run";
import { runRiskRulesEngine } from "../../../../server/services/risk-rules";

const baseCtx: any = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: null,
  actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" },
  authError: null
};

describe("POST /api/console/risk-rules/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-POST", async () => {
    const result: any = await handler({ method: "GET", body: {} }, null, { ...baseCtx });
    expect(result.status).toBe(405);
  });

  it("validates dry_run", async () => {
    const result: any = await handler({ method: "POST", body: { dry_run: "wat" } }, null, { ...baseCtx });
    expect(result.status).toBe(400);
  });

  it("validates max_agents_per_rule", async () => {
    const result: any = await handler({ method: "POST", body: { max_agents_per_rule: "0" } }, null, { ...baseCtx });
    expect(result.status).toBe(400);
  });

  it("runs engine", async () => {
    vi.mocked(runRiskRulesEngine).mockResolvedValue({
      rules_scanned: 3,
      flags_applied: 2
    } as any);

    const result: any = await handler(
      {
        method: "POST",
        body: { dry_run: true, rule_key: "rate_limit_triggers_1h", max_agents_per_rule: 10 }
      },
      null,
      { ...baseCtx }
    );

    expect(result.status).toBe(200);
    expect(result.body.rules_scanned).toBe(3);
    expect(runRiskRulesEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: true,
        ruleKey: "rate_limit_triggers_1h",
        maxAgentsPerRule: 10
      })
    );
  });

  it("sets audit event", async () => {
    vi.mocked(runRiskRulesEngine).mockResolvedValue({} as any);
    const ctx = { ...baseCtx };
    await handler({ method: "POST", body: {} }, null, ctx);
    expect(ctx.auditEvent).toBe("risk_rules.run");
  });
});

