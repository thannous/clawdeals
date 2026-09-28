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
});
