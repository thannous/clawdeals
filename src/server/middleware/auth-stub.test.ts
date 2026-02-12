import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../services/api-keys", () => ({
  authenticateApiKey: vi.fn()
}));

vi.mock("../services/oauth-access-tokens", () => ({
  authenticateOauthAccessToken: vi.fn(),
  isOauthAccessToken: (token: any) => typeof token === "string" && token.startsWith("cd_at_")
}));

vi.mock("../services/owner-sessions", () => ({
  getOwnerSessionByTokenHash: vi.fn(),
  markOwnerSessionExpired: vi.fn(),
  markOwnerSessionRevoked: vi.fn(),
  touchOwnerSession: vi.fn()
}));

vi.mock("../services/owners", () => ({
  getOwner: vi.fn()
}));

vi.mock("../utils/session-tokens", () => ({
  hashOwnerSessionToken: vi.fn(() => "test-hash"),
  isOwnerSessionToken: (token: any) => typeof token === "string" && token.startsWith("cd_os_")
}));

import { applyAuthStub } from "./auth-stub";
import { authenticateApiKey } from "../services/api-keys";
import { authenticateOauthAccessToken } from "../services/oauth-access-tokens";
import { getOwnerSessionByTokenHash, markOwnerSessionRevoked, touchOwnerSession } from "../services/owner-sessions";
import { getOwner } from "../services/owners";

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
      code: "API_KEY_REVOKED",
      message: "API key revoked"
    });
  });

  it("returns 401 for expired api key", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({ ok: false, reason: "expired" } as any);

    const req: any = { headers: { "x-clawdeals-api-key": "cd_live_abcdefgh.secret" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toEqual({
      status: 401,
      code: "API_KEY_EXPIRED",
      message: "API key expired"
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

  it("returns 401 for revoked OAuth access token", async () => {
    vi.mocked(authenticateOauthAccessToken).mockResolvedValue({ ok: false, reason: "revoked" } as any);

    const req: any = { headers: { authorization: "Bearer cd_at_revoked" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toEqual({
      status: 401,
      code: "TOKEN_REVOKED",
      message: "Access token revoked"
    });
  });

  it("returns 401 for expired OAuth access token", async () => {
    vi.mocked(authenticateOauthAccessToken).mockResolvedValue({ ok: false, reason: "expired" } as any);

    const req: any = { headers: { authorization: "Bearer cd_at_expired" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toEqual({
      status: 401,
      code: "TOKEN_EXPIRED",
      message: "Access token expired"
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

  it("authenticates via owner session cookie", async () => {
    vi.mocked(getOwnerSessionByTokenHash).mockResolvedValue({
      session_id: "sess-1",
      owner_id: "owner-123",
      status: "ACTIVE",
      expires_at: "2099-01-01T00:00:00Z"
    } as any);
    vi.mocked(getOwner).mockResolvedValue({
      owner_id: "owner-123",
      suspended_at: null
    } as any);

    const token = `cd_os_${"a".repeat(43)}`;
    const req: any = { headers: { cookie: `cd_owner_session=${token}` } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toBeNull();
    expect(ctx.ownerId).toBe("owner-123");
    expect(ctx.actor).toEqual({ type: "owner", id: "owner-123" });
    expect(touchOwnerSession).toHaveBeenCalledWith("sess-1", expect.any(Date));
  });

  it("blocks suspended owners authenticated by active session cookie", async () => {
    vi.mocked(getOwnerSessionByTokenHash).mockResolvedValue({
      session_id: "sess-1",
      owner_id: "owner-123",
      status: "ACTIVE",
      expires_at: "2099-01-01T00:00:00Z"
    } as any);
    vi.mocked(getOwner).mockResolvedValue({
      owner_id: "owner-123",
      suspended_at: "2026-02-10T00:00:00Z"
    } as any);

    const token = `cd_os_${"a".repeat(43)}`;
    const req: any = { headers: { cookie: `cd_owner_session=${token}` } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toEqual({
      status: 403,
      code: "OWNER_SUSPENDED",
      message: "Owner account is suspended"
    });
    expect(markOwnerSessionRevoked).toHaveBeenCalledWith("sess-1", expect.any(Date));
    expect(ctx.ownerId).toBeUndefined();
  });

  it("rejects invalid owner session cookies", async () => {
    const req: any = { headers: { cookie: "cd_owner_session=not-a-token" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toEqual({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid session cookie"
    });
    expect(ctx.ownerId).toBeUndefined();
  });
});
