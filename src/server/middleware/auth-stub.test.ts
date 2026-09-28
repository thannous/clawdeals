import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { authenticateOauthAccessToken } from "../services/oauth-access-tokens";
import { getOwnerSessionByTokenHash, markOwnerSessionRevoked } from "../services/owner-sessions";
import { getOwner } from "../services/owners";

describe("applyAuthStub", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = mutableEnv.NODE_ENV;
  const originalAuthAllowLegacyIdentityHeaders = mutableEnv.AUTH_ALLOW_LEGACY_IDENTITY_HEADERS;

  beforeEach(() => {
    vi.clearAllMocks();
    mutableEnv.NODE_ENV = originalNodeEnv || "test";
    if (originalAuthAllowLegacyIdentityHeaders === undefined) {
      delete mutableEnv.AUTH_ALLOW_LEGACY_IDENTITY_HEADERS;
    } else {
      mutableEnv.AUTH_ALLOW_LEGACY_IDENTITY_HEADERS = originalAuthAllowLegacyIdentityHeaders;
    }
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV;
    } else {
      mutableEnv.NODE_ENV = originalNodeEnv;
    }

    if (originalAuthAllowLegacyIdentityHeaders === undefined) {
      delete mutableEnv.AUTH_ALLOW_LEGACY_IDENTITY_HEADERS;
      return;
    }
    mutableEnv.AUTH_ALLOW_LEGACY_IDENTITY_HEADERS = originalAuthAllowLegacyIdentityHeaders;
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

  it("does not treat other Bearer tokens as OAuth tokens (e.g. connect poll tokens)", async () => {
    const req: any = { headers: { authorization: "Bearer cd_poll_test" } };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(authenticateOauthAccessToken).not.toHaveBeenCalled();
    expect(ctx.authError).toBeNull();
    expect(ctx.actor).toEqual({ type: "anonymous", id: null });
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

  it("accepts raw identity headers in non-production for backward-compatible stubs", async () => {
    const req: any = {
      headers: {
        "x-owner-id": "owner-from-header",
        "x-agent-id": "agent-from-header"
      }
    };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toBeNull();
    expect(ctx.ownerId).toBe("owner-from-header");
    expect(ctx.agentId).toBe("agent-from-header");
    expect(ctx.actor).toEqual({ type: "agent", id: "agent-from-header" });
  });

  it("does not trust raw identity headers in production without server-injected trusted identity", async () => {
    mutableEnv.NODE_ENV = "production";
    const req: any = {
      headers: {
        "x-owner-id": "owner-from-header",
        "x-agent-id": "agent-from-header"
      }
    };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toBeNull();
    expect(ctx.ownerId).toBeNull();
    expect(ctx.agentId).toBeNull();
    expect(ctx.actor).toEqual({ type: "anonymous", id: null });
  });

  it("accepts raw identity headers in production when legacy identity bridge is explicitly enabled", async () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.AUTH_ALLOW_LEGACY_IDENTITY_HEADERS = "1";
    const req: any = {
      headers: {
        "x-owner-id": "owner-from-header",
        "x-agent-id": "agent-from-header"
      }
    };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toBeNull();
    expect(ctx.ownerId).toBe("owner-from-header");
    expect(ctx.agentId).toBe("agent-from-header");
    expect(ctx.actor).toEqual({ type: "agent", id: "agent-from-header" });
  });

  it("accepts trusted identity injected by server middleware", async () => {
    const req: any = {
      headers: {},
      __clawdealsTrustedIdentity: { ownerId: "owner-trusted" }
    };
    const ctx: any = {};
    await applyAuthStub(req, ctx);

    expect(ctx.authError).toBeNull();
    expect(ctx.ownerId).toBe("owner-trusted");
    expect(ctx.agentId).toBeNull();
    expect(ctx.actor).toEqual({ type: "owner", id: "owner-trusted" });
  });
});
