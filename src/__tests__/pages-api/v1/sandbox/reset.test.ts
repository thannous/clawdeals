import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../server/services/sandbox-fixtures", () => ({
  resetSandboxFixtures: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/sandbox/reset";
import { resetSandboxFixtures } from "../../../../server/services/sandbox-fixtures";

const resetSandboxFixturesMock = vi.mocked(resetSandboxFixtures);

describe("GET/POST /v1/sandbox/reset", () => {
  const prevEnv = process.env.CLAWDEALS_ENV;
  const prevJudgeAgentId = process.env.WEBMCP_JUDGE_AGENT_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLAWDEALS_ENV;
    delete process.env.WEBMCP_JUDGE_AGENT_ID;
  });

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.CLAWDEALS_ENV;
    } else {
      process.env.CLAWDEALS_ENV = prevEnv;
    }
    if (prevJudgeAgentId === undefined) {
      delete process.env.WEBMCP_JUDGE_AGENT_ID;
    } else {
      process.env.WEBMCP_JUDGE_AGENT_ID = prevJudgeAgentId;
    }
  });

  it("returns 404 outside sandbox", async () => {
    process.env.CLAWDEALS_ENV = "production";
    const req: any = { method: "POST", headers: {}, body: {} };
    const ctx: any = { agentId: "agent-1", authError: null };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("requires agent authentication", async () => {
    process.env.CLAWDEALS_ENV = "sandbox";
    const req: any = { method: "POST", headers: {}, body: {} };
    const ctx: any = { agentId: null, authError: null };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("propagates auth errors", async () => {
    process.env.CLAWDEALS_ENV = "sandbox";
    const req: any = { method: "POST", headers: {}, body: {} };
    const ctx: any = { authError: { status: 401, code: "UNAUTHORIZED", message: "Invalid" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("calls resetSandboxFixtures and returns result", async () => {
    process.env.CLAWDEALS_ENV = "sandbox";
    resetSandboxFixturesMock.mockResolvedValue({ ok: true, counts: { deals: 1, listings: 2, watchlists: 3 } } as any);

    const req: any = { method: "POST", headers: {}, body: {} };
    const ctx: any = { agentId: "agent-1", authError: null };
    const result: any = await handler(req, null, ctx);

    expect(resetSandboxFixturesMock).toHaveBeenCalledWith({ agentId: "agent-1", judgeMode: false });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(ctx.auditEvent).toBe("sandbox.reset");
  });

  it("reports judge capability without exposing the configured agent", async () => {
    process.env.CLAWDEALS_ENV = "sandbox";
    process.env.WEBMCP_JUDGE_AGENT_ID = "judge-agent";

    const anonymous: any = await handler(
      { method: "GET", headers: {}, body: {} },
      null,
      { agentId: null, authError: null }
    );
    const judge: any = await handler(
      { method: "GET", headers: {}, body: {} },
      null,
      { agentId: "judge-agent", authError: null }
    );

    expect(anonymous).toMatchObject({ status: 200, body: { enabled: true, authorized: false } });
    expect(judge).toMatchObject({ status: 200, body: { enabled: true, authorized: true } });
    expect(JSON.stringify(judge.body)).not.toContain("judge-agent");
  });

  it("keeps judge capability disabled when no judge is configured", async () => {
    process.env.CLAWDEALS_ENV = "sandbox";
    const result: any = await handler(
      { method: "GET", headers: {}, body: {} },
      null,
      { agentId: "agent-1", authError: null }
    );
    expect(result).toMatchObject({ status: 200, body: { enabled: false, authorized: false } });
  });

  it("allows the deterministic challenge reset only for the configured judge", async () => {
    process.env.CLAWDEALS_ENV = "sandbox";
    process.env.WEBMCP_JUDGE_AGENT_ID = "judge-agent";
    resetSandboxFixturesMock.mockResolvedValue({ ok: true, counts: { threads: 1, messages: 1 } } as any);

    const denied: any = await handler(
      { method: "POST", headers: {}, body: { mode: "webmcp_challenge" } },
      null,
      { agentId: "other-agent", authError: null }
    );
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("JUDGE_ACCESS_REQUIRED");
    expect(resetSandboxFixturesMock).not.toHaveBeenCalled();

    const allowedCtx: any = { agentId: "judge-agent", authError: null };
    const allowed: any = await handler(
      { method: "POST", headers: {}, body: { mode: "webmcp_challenge" } },
      null,
      allowedCtx
    );
    expect(allowed.status).toBe(200);
    expect(resetSandboxFixturesMock).toHaveBeenCalledWith({ agentId: "judge-agent", judgeMode: true });
    expect(allowedCtx.auditEvent).toBe("sandbox.webmcp_challenge.reset");
  });

  it("hides challenge reset when no judge is configured", async () => {
    process.env.CLAWDEALS_ENV = "sandbox";
    const result: any = await handler(
      { method: "POST", headers: {}, body: { mode: "webmcp_challenge" } },
      null,
      { agentId: "agent-1", authError: null }
    );
    expect(result.status).toBe(404);
    expect(resetSandboxFixturesMock).not.toHaveBeenCalled();
  });

  it("rejects unknown reset modes instead of falling back to the legacy reset", async () => {
    process.env.CLAWDEALS_ENV = "sandbox";
    const result: any = await handler(
      { method: "POST", headers: {}, body: { mode: "webmcp_challeng" } },
      null,
      { agentId: "agent-1", authError: null }
    );
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(resetSandboxFixturesMock).not.toHaveBeenCalled();
  });
});
