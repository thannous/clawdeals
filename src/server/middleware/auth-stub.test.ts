import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../services/api-keys", () => ({
  authenticateApiKey: vi.fn()
}));

vi.mock("../services/oauth-access-tokens", () => ({
  authenticateOauthAccessToken: vi.fn(),
  isOauthAccessToken: (token: any) => typeof token === "string" && token.startsWith("cd_at_")
}));

import { applyAuthStub } from "./auth-stub";
import { authenticateApiKey } from "../services/api-keys";
import { authenticateOauthAccessToken } from "../services/oauth-access-tokens";

describe("applyAuthStub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid Authorization header", async () => {
    const req: any = { headers: { authorization: "Basic abc" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toEqual({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid Authorization header"
    });
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

  it("returns 401 for invalid api key", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: false, reason: "not_found" } as any);

    const req: any = { headers: { "x-clawdeals-api-key": "cd_live_abcdefgh.secret" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toEqual({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid API key"
    });
  });

  it("returns 401 for revoked api key", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: false, reason: "revoked" } as any);

    const req: any = { headers: { "x-clawdeals-api-key": "cd_live_abcdefgh.secret" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toEqual({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid API key"
    });
  });

  it("rejects api keys from a different namespace (fail closed)", async () => {
    const req: any = {
      headers: {
        "x-clawdeals-api-key": "cd_sandbox_abcdefgh.secret",
        "x-agent-id": "agent-should-not-be-used"
      }
    };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toEqual({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid API key"
    });
    expect(ctx.agentId).toBeUndefined();
  });

  it("authenticates via OAuth access token (Bearer cd_at_...)", async () => {
    vi.mocked(authenticateOauthAccessToken).mockResolvedValue({
      ok: true,
      agentId: "agent-oauth",
      ownerId: "owner-oauth",
      installationId: "install-oauth",
      scopes: ["agent:read"]
    } as any);

    const req: any = { headers: { authorization: "Bearer cd_at_test" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(authenticateOauthAccessToken).toHaveBeenCalledWith("cd_at_test");
    expect(ctx.authError).toBeNull();
    expect(ctx.agentId).toBe("agent-oauth");
    expect(ctx.ownerId).toBe("owner-oauth");
    expect(ctx.installationId).toBe("install-oauth");
    expect(ctx.oauthScopes).toEqual(["agent:read"]);
    expect(ctx.actor).toEqual({ type: "agent", id: "agent-oauth" });
  });

  it("returns 401 for invalid OAuth access token", async () => {
    vi.mocked(authenticateOauthAccessToken).mockResolvedValue({ ok: false, reason: "not_found" } as any);

    const req: any = { headers: { authorization: "Bearer cd_at_invalid" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toEqual({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid access token"
    });
  });

  it("does not treat other Bearer tokens as OAuth tokens (e.g. connect poll tokens)", async () => {
    const req: any = { headers: { authorization: "Bearer cd_poll_test" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(authenticateOauthAccessToken).not.toHaveBeenCalled();
    expect(ctx.authError).toBeNull();
    expect(ctx.actor).toEqual({ type: "anonymous", id: null });
  });
});
