import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/risk-rules", () => ({
  listRiskRules: vi.fn()
}));

import { handler } from "../../../../pages/api/console/risk-rules/index";
import { listRiskRules } from "../../../../server/services/risk-rules";

const baseCtx: any = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: null,
  actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" },
  authError: null
};

describe("GET /api/console/risk-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-GET", async () => {
    const result: any = await handler({ method: "POST", query: {} }, null, { ...baseCtx });
    expect(result.status).toBe(405);
  });

  it("returns 401 without ownerId", async () => {
    const result: any = await handler({ method: "GET", query: {} }, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns authError", async () => {
    const result: any = await handler(
      { method: "GET", query: {} },
      null,
      { ...baseCtx, authError: { status: 403, code: "FORBIDDEN", message: "Denied" } }
    );
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("FORBIDDEN");
  });

  it("validates enabled query parameter", async () => {
    const result: any = await handler({ method: "GET", query: { enabled: "wat" } }, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns items", async () => {
    vi.mocked(listRiskRules).mockResolvedValue([
      { risk_rule_id: "11111111-1111-4111-8111-111111111111", rule_key: "rate_limit_triggers_1h", enabled: true }
    ] as any);

    const result: any = await handler({ method: "GET", query: {} }, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].rule_key).toBe("rate_limit_triggers_1h");
  });

  it("passes enabled=true and rule_key filters", async () => {
    vi.mocked(listRiskRules).mockResolvedValue([] as any);
    await handler({ method: "GET", query: { enabled: "true", rule_key: "x" } }, null, { ...baseCtx });
    expect(listRiskRules).toHaveBeenCalledWith(
      expect.objectContaining({
        enabledOnly: true,
        ruleKey: "x"
      })
    );
  });

  it("sets audit event", async () => {
    vi.mocked(listRiskRules).mockResolvedValue([] as any);
    const ctx = { ...baseCtx };
    await handler({ method: "GET", query: {} }, null, ctx);
    expect(ctx.auditEvent).toBe("risk_rules.listed");
  });
});

