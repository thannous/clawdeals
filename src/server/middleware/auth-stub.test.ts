import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../services/api-keys", () => ({
  authenticateApiKey: vi.fn()
}));

import { applyAuthStub } from "./auth-stub";
import { authenticateApiKey } from "../services/api-keys";

describe("applyAuthStub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticates via x-clawdeals-api-key header", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      ok: true,
      agentId: "agent-1",
      ownerId: "owner-1",
      apiKeyId: "key-1",
      keyState: "ACTIVE"
    } as any);

    const req: any = { headers: { "x-clawdeals-api-key": "cd_live_abcdefgh.secret" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(authenticateApiKey).toHaveBeenCalledWith("cd_live_abcdefgh.secret");
    expect(ctx.authError).toBeNull();
    expect(ctx.agentId).toBe("agent-1");
    expect(ctx.ownerId).toBe("owner-1");
    expect(ctx.apiKeyId).toBe("key-1");
    expect(ctx.apiKeyState).toBe("ACTIVE");
    expect(ctx.actor).toEqual({ type: "agent", id: "agent-1" });
  });
});

