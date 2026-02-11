import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../server/rate-limit/middleware", () => ({
  rateLimitMiddleware: vi.fn().mockResolvedValue(null)
}));

vi.mock("../../../server/services/oauth-refresh-tokens", () => ({
  getOauthRefreshTokenRecordByToken: vi.fn(),
  revokeRefreshToken: vi.fn()
}));

vi.mock("../../../server/services/oauth-access-tokens", () => ({
  getOauthAccessTokenRecordByToken: vi.fn(),
  revokeOauthAccessToken: vi.fn()
}));

import { handler } from "../../../pages/api/oauth/revoke";
import { rateLimitMiddleware } from "../../../server/rate-limit/middleware";
import { getOauthRefreshTokenRecordByToken, revokeRefreshToken } from "../../../server/services/oauth-refresh-tokens";
import {
  getOauthAccessTokenRecordByToken,
  revokeOauthAccessToken
} from "../../../server/services/oauth-access-tokens";

const getRefreshMock = vi.mocked(getOauthRefreshTokenRecordByToken);
const revokeRefreshMock = vi.mocked(revokeRefreshToken);
const getAccessMock = vi.mocked(getOauthAccessTokenRecordByToken);
const revokeAccessMock = vi.mocked(revokeOauthAccessToken);
const rateLimitMock = vi.mocked(rateLimitMiddleware);

describe("POST /oauth/revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue(null as any);
    getRefreshMock.mockResolvedValue(null as any);
    getAccessMock.mockResolvedValue(null as any);
    revokeRefreshMock.mockResolvedValue({
      found: false,
      revoked: false,
      token_id: null,
      owner_id: null,
      token_hash: null
    } as any);
    revokeAccessMock.mockResolvedValue({
      found: false,
      revoked: false,
      access_token_hash: null,
      owner_id: null,
      agent_id: null,
      installation_id: null
    } as any);
  });

  it("requires token", async () => {
    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", token_type_hint: "refresh_token" }
    };
    const ctx: any = { authError: null, body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("revokes token and returns 200 {}", async () => {
    getRefreshMock.mockResolvedValue({
      tokenHash: "hash",
      record: { token_id: "t1", owner_id: "owner-1" }
    } as any);
    revokeRefreshMock.mockResolvedValue({
      found: true,
      revoked: true,
      token_id: "t1",
      owner_id: "owner-1",
      token_hash: "hash"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", token_type_hint: "refresh_token", token: "cd_rt_test" }
    };
    const ctx: any = { authError: null, ip: "203.0.113.1", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({});

    expect(ctx.body?.token).toBeUndefined();
    expect(ctx.auditEvent).toBe("oauth.token_revoked");
    expect(ctx.auditEntityType).toBe("oauth_refresh_token");
    expect(ctx.auditEntityId).toBe("t1");
    expect(ctx.security).toEqual(
      expect.objectContaining({
        refresh_token_id: "t1",
        refresh_token_hash: "hash"
      })
    );

    expect(rateLimitMiddleware).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        routeGroup: "oauth.revoke",
        ownerId: "owner-1",
        ip: "203.0.113.1"
      })
    );
  });

  it("revokes an access token when hinted and keeps audit context coherent", async () => {
    getAccessMock.mockResolvedValue({
      accessTokenHash: "at_hash",
      record: {
        v: 1,
        owner_id: "owner-2",
        agent_id: "agent-2",
        installation_id: "inst-2",
        scopes: ["agent:read"],
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 1_000).toISOString()
      }
    } as any);
    revokeAccessMock.mockResolvedValue({
      found: true,
      revoked: true,
      access_token_hash: "at_hash",
      owner_id: "owner-2",
      agent_id: "agent-2",
      installation_id: "inst-2"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", token_type_hint: "access_token", token: "cd_at_test" }
    };
    const ctx: any = { authError: null, ip: "203.0.113.9", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({});
    expect(ctx.auditEntityType).toBe("oauth_access_token");
    expect(ctx.auditEntityId).toBeNull();
    expect(ctx.security).toEqual(
      expect.objectContaining({
        access_token_id: null,
        access_token_hash: "at_hash"
      })
    );

    expect(getRefreshMock).not.toHaveBeenCalled();
    expect(revokeRefreshMock).not.toHaveBeenCalled();
    expect(rateLimitMiddleware).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        routeGroup: "oauth.revoke",
        ownerId: "owner-2",
        ip: "203.0.113.9"
      })
    );
  });

  it("falls back across token families when hint misses", async () => {
    getAccessMock.mockResolvedValue(null as any);
    getRefreshMock.mockResolvedValue({
      tokenHash: "rt_hash",
      record: { token_id: "rt_1", owner_id: "owner-3" }
    } as any);
    revokeAccessMock.mockResolvedValue({
      found: false,
      revoked: false,
      access_token_hash: null,
      owner_id: null,
      agent_id: null,
      installation_id: null
    } as any);
    revokeRefreshMock.mockResolvedValue({
      found: true,
      revoked: true,
      token_id: "rt_1",
      owner_id: "owner-3",
      token_hash: "rt_hash"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", token_type_hint: "access_token", token: "cd_rt_test" }
    };
    const ctx: any = { authError: null, ip: "203.0.113.10", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({});

    expect(getAccessMock).toHaveBeenCalledWith({ accessToken: "cd_rt_test" });
    expect(getRefreshMock).toHaveBeenCalledWith({ refreshToken: "cd_rt_test" });
    expect(revokeAccessMock).toHaveBeenCalledWith({ accessToken: "cd_rt_test", now: expect.any(Date) });
    expect(revokeRefreshMock).toHaveBeenCalledWith({ refreshToken: "cd_rt_test", now: expect.any(Date) });
    expect(ctx.auditEntityType).toBe("oauth_refresh_token");
    expect(ctx.auditEntityId).toBe("rt_1");
  });

  it("ignores unsupported token_type_hint values", async () => {
    getRefreshMock.mockResolvedValue(null as any);
    getAccessMock.mockResolvedValue({
      accessTokenHash: "at_hash_2",
      record: {
        v: 1,
        owner_id: "owner-4",
        agent_id: "agent-4",
        installation_id: "inst-4",
        scopes: ["agent:read"],
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 1_000).toISOString()
      }
    } as any);
    revokeRefreshMock.mockResolvedValue({
      found: false,
      revoked: false,
      token_id: null,
      owner_id: null,
      token_hash: null
    } as any);
    revokeAccessMock.mockResolvedValue({
      found: true,
      revoked: true,
      access_token_hash: "at_hash_2",
      owner_id: "owner-4",
      agent_id: "agent-4",
      installation_id: "inst-4"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", token_type_hint: "id_token", token: "cd_at_unknown_hint" }
    };
    const ctx: any = { authError: null, ip: "203.0.113.11", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({});
    expect(ctx.auditEntityType).toBe("oauth_access_token");
    expect(ctx.security).toEqual(
      expect.objectContaining({
        access_token_hash: "at_hash_2"
      })
    );
  });

  it("returns 200 {} even when token is invalid/unknown (no probing)", async () => {
    getRefreshMock.mockResolvedValue(null as any);
    getAccessMock.mockResolvedValue(null as any);
    revokeRefreshMock.mockRejectedValue({ status: 404, code: "invalid_grant", message: "Invalid refresh token" } as any);
    revokeAccessMock.mockRejectedValue({ status: 404, code: "invalid_token", message: "Invalid access token" } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", token: "cd_unknown" }
    };
    const ctx: any = { authError: null, ip: "203.0.113.1", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({});
    expect(ctx.security).toEqual(
      expect.objectContaining({
        refresh_token_hash: null,
        access_token_hash: null
      })
    );
  });

  it("returns backend error when access-token revoke storage is unavailable", async () => {
    getAccessMock.mockResolvedValue({
      accessTokenHash: "at_hash_5",
      record: {
        v: 1,
        owner_id: "owner-5",
        agent_id: "agent-5",
        installation_id: "inst-5",
        scopes: ["agent:read"],
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 1_000).toISOString()
      }
    } as any);
    revokeAccessMock.mockRejectedValue({
      status: 503,
      code: "AUTH_UNAVAILABLE",
      message: "Failed to revoke access token"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", token_type_hint: "access_token", token: "cd_at_test" }
    };
    const ctx: any = { authError: null, ip: "203.0.113.12", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("AUTH_UNAVAILABLE");
  });
});
