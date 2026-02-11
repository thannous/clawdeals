import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/risk-rules", () => ({
  updateRiskRule: vi.fn()
}));

import { handler } from "../../../../pages/api/console/risk-rules/[rule_id]";
import { updateRiskRule } from "../../../../server/services/risk-rules";

const baseCtx: any = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: null,
  actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" },
  authError: null
};

const RULE_ID = "11111111-1111-4111-8111-111111111111";

describe("PATCH /api/console/risk-rules/[rule_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-PATCH", async () => {
    const result: any = await handler({ method: "GET", query: { rule_id: RULE_ID } }, null, { ...baseCtx });
    expect(result.status).toBe(405);
  });

  it("validates rule_id", async () => {
    const result: any = await handler(
      { method: "PATCH", query: { rule_id: "nope" }, body: { enabled: true } },
      null,
      { ...baseCtx }
    );
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires patch fields", async () => {
    const result: any = await handler(
      { method: "PATCH", query: { rule_id: RULE_ID }, body: {} },
      null,
      { ...baseCtx }
    );
    expect(result.status).toBe(400);
  });

  it("updates rule", async () => {
    vi.mocked(updateRiskRule).mockResolvedValue({
      risk_rule_id: RULE_ID,
      enabled: false
    } as any);

    const result: any = await handler(
      {
        method: "PATCH",
        query: { rule_id: RULE_ID },
        body: { enabled: false, threshold: 20 }
      },
      null,
      { ...baseCtx }
    );

    expect(result.status).toBe(200);
    expect(result.body.item.enabled).toBe(false);
    expect(updateRiskRule).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: RULE_ID,
        updatedBy: baseCtx.ownerId
      })
    );
  });

  it("sets audit event", async () => {
    vi.mocked(updateRiskRule).mockResolvedValue({ risk_rule_id: RULE_ID } as any);
    const ctx = { ...baseCtx };
    await handler({ method: "PATCH", query: { rule_id: RULE_ID }, body: { enabled: true } }, null, ctx);
    expect(ctx.auditEvent).toBe("risk_rule.updated");
  });
});

