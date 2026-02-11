import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/risk-rules", () => ({
  manualUnflagRiskFlag: vi.fn()
}));

import { handler } from "../../../../pages/api/console/risk-rules/unflag";
import { manualUnflagRiskFlag } from "../../../../server/services/risk-rules";

const baseCtx: any = {
  ownerId: "00000000-0000-4000-a000-000000000000",
  agentId: null,
  actor: { type: "owner", id: "00000000-0000-4000-a000-000000000000" },
  authError: null
};

describe("POST /api/console/risk-rules/unflag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-POST", async () => {
    const result: any = await handler({ method: "GET", body: {} }, null, { ...baseCtx });
    expect(result.status).toBe(405);
  });

  it("validates agent_id", async () => {
    const result: any = await handler(
      { method: "POST", body: { agent_id: "nope", flag: "restricted", reason: "ok" } },
      null,
      { ...baseCtx }
    );
    expect(result.status).toBe(400);
  });

  it("validates flag", async () => {
    const result: any = await handler(
      {
        method: "POST",
        body: {
          agent_id: "11111111-1111-4111-8111-111111111111",
          flag: "bad_flag",
          reason: "ok"
        }
      },
      null,
      { ...baseCtx }
    );
    expect(result.status).toBe(400);
  });

  it("requires reason", async () => {
    const result: any = await handler(
      {
        method: "POST",
        body: {
          agent_id: "11111111-1111-4111-8111-111111111111",
          flag: "restricted",
          reason: ""
        }
      },
      null,
      { ...baseCtx }
    );
    expect(result.status).toBe(400);
  });

  it("calls manualUnflagRiskFlag", async () => {
    vi.mocked(manualUnflagRiskFlag).mockResolvedValue({
      agent_id: "11111111-1111-4111-8111-111111111111",
      flag: "restricted",
      removed: true,
      trust_flags: []
    } as any);

    const result: any = await handler(
      {
        method: "POST",
        body: {
          agent_id: "11111111-1111-4111-8111-111111111111",
          flag: "restricted",
          reason: "false positive"
        }
      },
      null,
      { ...baseCtx }
    );

    expect(result.status).toBe(200);
    expect(result.body.result.removed).toBe(true);
    expect(manualUnflagRiskFlag).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "11111111-1111-4111-8111-111111111111",
        flag: "restricted",
        reason: "false positive"
      })
    );
  });
});

