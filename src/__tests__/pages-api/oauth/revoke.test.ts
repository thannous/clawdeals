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
