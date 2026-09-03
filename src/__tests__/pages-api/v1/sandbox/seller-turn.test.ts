import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/sandbox-seller-autopilot", () => ({
  runSandboxSellerTurn: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/sandbox/seller-turn";
import { runSandboxSellerTurn } from "../../../../server/services/sandbox-seller-autopilot";

const runMock = vi.mocked(runSandboxSellerTurn);
const SANDBOX_URL_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;
const STAGING_SUPABASE_URL = "https://usuyppgsmmowzizhaoqj.supabase.co";
const PRODUCTION_SUPABASE_URL = "https://gztfmpuqtpvncdcuhqxy.supabase.co";

describe("POST /v1/sandbox/seller-turn", () => {
  const prev = {
    env: process.env.CLAWDEALS_ENV,
    judge: process.env.WEBMCP_JUDGE_AGENT_ID,
    urls: Object.fromEntries(SANDBOX_URL_KEYS.map((key) => [key, process.env[key]]))
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLAWDEALS_ENV = "sandbox";
    process.env.WEBMCP_JUDGE_AGENT_ID = "judge-agent";
    for (const key of SANDBOX_URL_KEYS) process.env[key] = STAGING_SUPABASE_URL;
  });

  afterEach(() => {
    if (prev.env === undefined) delete process.env.CLAWDEALS_ENV;
    else process.env.CLAWDEALS_ENV = prev.env;
    if (prev.judge === undefined) delete process.env.WEBMCP_JUDGE_AGENT_ID;
    else process.env.WEBMCP_JUDGE_AGENT_ID = prev.judge;
    for (const key of SANDBOX_URL_KEYS) {
      if (prev.urls[key] === undefined) delete process.env[key];
      else process.env[key] = prev.urls[key];
    }
  });

  it("returns 404 in production and when no judge is configured", async () => {
    process.env.CLAWDEALS_ENV = "production";
    const prod: any = await handler({ method: "POST", headers: {}, body: {} }, null, { agentId: "judge-agent", authError: null });
    expect(prod).toMatchObject({ status: 404, body: { error: { code: "NOT_FOUND" } } });

    process.env.CLAWDEALS_ENV = "sandbox";
    delete process.env.WEBMCP_JUDGE_AGENT_ID;
    const unconfigured: any = await handler({ method: "POST", headers: {}, body: {} }, null, { agentId: "judge-agent", authError: null });
    expect(unconfigured.status).toBe(404);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("fails closed on a production database target", async () => {
    for (const key of SANDBOX_URL_KEYS) process.env[key] = PRODUCTION_SUPABASE_URL;
    const result: any = await handler({ method: "POST", headers: {}, body: {} }, null, { agentId: "judge-agent", authError: null });
    expect(result.status).toBe(403);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("rejects GET, anonymous agents and non-judge agents", async () => {
    const get: any = await handler({ method: "GET", headers: {}, body: {} }, null, { agentId: "judge-agent", authError: null });
    expect(get.status).toBe(405);

    const anonymous: any = await handler({ method: "POST", headers: {}, body: {} }, null, { agentId: null, authError: null });
    expect(anonymous).toMatchObject({ status: 401, body: { error: { code: "UNAUTHORIZED" } } });

    const other: any = await handler({ method: "POST", headers: {}, body: {} }, null, { agentId: "other-agent", authError: null });
    expect(other).toMatchObject({ status: 403, body: { error: { code: "JUDGE_ACCESS_REQUIRED" } } });
    expect(JSON.stringify(other.body)).not.toContain("judge-agent");
    expect(runMock).not.toHaveBeenCalled();
  });

  it("runs the synthetic seller turn for the judge and audits it", async () => {
    runMock.mockResolvedValue({
      action: "counter",
      idempotent: false,
      reason: "amount_below_floor_1250",
      offer: { offer_id: "o2", previous_offer_id: "o1", thread_id: "t", listing_id: "l", amount: 1350, currency: "EUR", status: "CREATED", expires_at: null },
      listing_status: null,
      transaction: null
    });
    const ctx: any = { agentId: "judge-agent", authError: null };
    const result: any = await handler({ method: "POST", headers: {}, body: {} }, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ action: "counter", offer: { amount: 1350 } });
    expect(runMock).toHaveBeenCalledWith({ buyerAgentId: "judge-agent", judgeAgentId: "judge-agent" });
    expect(ctx.auditEvent).toBe("sandbox.webmcp_challenge.seller_turn");
  });

  it("maps service errors to their status and code", async () => {
    runMock.mockRejectedValue(Object.assign(new Error("No offer"), { status: 409, code: "NO_OPEN_OFFER" }));
    const result: any = await handler({ method: "POST", headers: {}, body: {} }, null, { agentId: "judge-agent", authError: null });
    expect(result).toMatchObject({ status: 409, body: { error: { code: "NO_OPEN_OFFER" } } });
  });
});
