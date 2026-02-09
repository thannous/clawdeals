import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../server/services/sandbox-fixtures", () => ({
  resetSandboxFixtures: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/sandbox/reset";
import { resetSandboxFixtures } from "../../../../server/services/sandbox-fixtures";

const resetSandboxFixturesMock = vi.mocked(resetSandboxFixtures);

describe("POST /v1/sandbox/reset", () => {
  const prevEnv = process.env.CLAWDEALS_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLAWDEALS_ENV;
  });

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.CLAWDEALS_ENV;
    } else {
      process.env.CLAWDEALS_ENV = prevEnv;
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

    expect(resetSandboxFixturesMock).toHaveBeenCalledWith({ agentId: "agent-1" });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(ctx.auditEvent).toBe("sandbox.reset");
  });
});

