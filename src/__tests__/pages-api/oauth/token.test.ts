import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../server/rate-limit/middleware", () => ({
  rateLimitMiddleware: vi.fn().mockResolvedValue(null)
}));

vi.mock("../../../server/services/oauth-device-authorizations", () => ({
  getOauthDeviceAuthorizationByDeviceCode: vi.fn(),
  markOauthDeviceAuthorizationExchanged: vi.fn(),
  consumeOauthDeviceTokenPollAttempt: vi.fn()
}));

vi.mock("../../../server/services/agent-installations", () => ({
  createAgentInstallation: vi.fn(),
  deleteAgentInstallation: vi.fn()
}));

vi.mock("../../../server/services/oauth-refresh-tokens", () => ({
  getOauthRefreshTokenRecordByToken: vi.fn(),
  issueRefreshTokenRecord: vi.fn(),
  rotateRefreshToken: vi.fn()
}));

vi.mock("../../../server/services/oauth-access-tokens", () => ({
  issueOauthAccessToken: vi.fn(),
  deleteOauthAccessTokenByHash: vi.fn()
}));

import { handler } from "../../../pages/api/oauth/token";
import { rateLimitMiddleware } from "../../../server/rate-limit/middleware";
import { V1_SCOPES_DEFAULT } from "../../../shared/scopes/v1";
import {
  consumeOauthDeviceTokenPollAttempt,
  getOauthDeviceAuthorizationByDeviceCode,
  markOauthDeviceAuthorizationExchanged
} from "../../../server/services/oauth-device-authorizations";
import { createAgentInstallation } from "../../../server/services/agent-installations";
import {
  getOauthRefreshTokenRecordByToken,
  issueRefreshTokenRecord,
  rotateRefreshToken
} from "../../../server/services/oauth-refresh-tokens";
import {
  deleteOauthAccessTokenByHash,
  issueOauthAccessToken
} from "../../../server/services/oauth-access-tokens";

const rateLimitMock = vi.mocked(rateLimitMiddleware);
const getByDeviceCodeMock = vi.mocked(getOauthDeviceAuthorizationByDeviceCode);
const markExchangedMock = vi.mocked(markOauthDeviceAuthorizationExchanged);
const consumeDevicePollAttemptMock = vi.mocked(consumeOauthDeviceTokenPollAttempt);
const createInstallationMock = vi.mocked(createAgentInstallation);
const issueRefreshMock = vi.mocked(issueRefreshTokenRecord);
const getRefreshMock = vi.mocked(getOauthRefreshTokenRecordByToken);
const rotateMock = vi.mocked(rotateRefreshToken);
const issueAccessMock = vi.mocked(issueOauthAccessToken);
const deleteAccessByHashMock = vi.mocked(deleteOauthAccessTokenByHash);

describe("POST /oauth/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue(null as any);
    consumeDevicePollAttemptMock.mockResolvedValue(null as any);
  });

  it("requires client_id", async () => {
    const req: any = { method: "POST", headers: {}, body: { grant_type: "refresh_token" } };
    const ctx: any = { authError: null };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns authorization_pending for a PENDING device authorization", async () => {
    getByDeviceCodeMock.mockResolvedValue({
      authorization_id: "auth-1",
      status: "PENDING",
      expires_at: new Date(Date.now() + 60_000).toISOString()
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        client_id: "openclaw",
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: "cd_dev_test"
      }
    };
    const ctx: any = { authError: null, ip: "203.0.113.1" };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("authorization_pending");

    expect(rateLimitMiddleware).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        routeGroup: "oauth.token",
        ip: "203.0.113.1"
      })
    );
  });

  it("returns slow_down when the device client polls too quickly", async () => {
    getByDeviceCodeMock.mockResolvedValue({
      authorization_id: "auth-1",
      status: "PENDING",
      expires_at: new Date(Date.now() + 60_000).toISOString()
    } as any);
    consumeDevicePollAttemptMock.mockResolvedValue({
      code: "slow_down",
      retry_after_seconds: 3
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        client_id: "openclaw",
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: "cd_dev_test"
      }
    };
    const result: any = await handler(req, null, { authError: null, ip: "203.0.113.1" });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("slow_down");
    expect(result.headers["Retry-After"]).toBe("3");
    expect(result.headers["Cache-Control"]).toBe("no-store");
  });

  it("exchanges an authorized device_code for access+refresh tokens (and sanitizes ctx.body)", async () => {
    getByDeviceCodeMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "AUTHORIZED",
      client_id: "openclaw",
      owner_id: "22222222-2222-2222-2222-222222222222",
      agent_id: "33333333-3333-4333-8333-333333333333",
      requested_scopes: ["agent:read", "agent:write"],
      requested_agent_name: "Integration OpenClaw",
      device_code_hash: "dhash",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      exchanged_at: null
    } as any);

    createInstallationMock.mockResolvedValue({
      installation_id: "44444444-4444-4444-4444-444444444444"
    } as any);

    issueRefreshMock.mockResolvedValue({
      refresh_token: "cd_rt_test",
      token_id: "55555555-5555-4555-8555-555555555555",
      token_hash: "rthash",
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    } as any);

    issueAccessMock.mockResolvedValue({
      access_token: "cd_at_test",
      access_token_hash: "athash",
      expires_in: 900,
      expires_at: new Date(Date.now() + 900_000).toISOString(),
      issued_at: new Date().toISOString()
    } as any);

    markExchangedMock.mockResolvedValue({ authorization_id: "11111111-1111-1111-1111-111111111111" } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        client_id: "openclaw",
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: "cd_dev_test"
      }
    };
    const ctx: any = { authError: null, ip: "203.0.113.1", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.access_token).toBe("cd_at_test");
    expect(result.body.refresh_token).toBe("cd_rt_test");
    expect(result.body.token_type).toBe("Bearer");
    expect(result.body.scope).toBe(V1_SCOPES_DEFAULT.join(" "));

    expect(createAgentInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "22222222-2222-2222-2222-222222222222",
        agentId: "33333333-3333-4333-8333-333333333333",
        clientType: "openclaw"
      })
    );
    expect(issueRefreshMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: V1_SCOPES_DEFAULT
      })
    );
    expect(issueAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: V1_SCOPES_DEFAULT
      })
    );

    expect(ctx.body?.device_code).toBeUndefined();
    expect(ctx.auditEvent).toBe("oauth.token_issued");
    expect(ctx.auditEntityType).toBe("oauth_refresh_token");
    expect(ctx.auditEntityId).toBe("55555555-5555-4555-8555-555555555555");
    expect(ctx.security).toEqual(
      expect.objectContaining({
        authorization_id: "11111111-1111-1111-1111-111111111111",
        device_code_hash: "dhash",
        installation_id: "44444444-4444-4444-4444-444444444444",
        refresh_token_id: "55555555-5555-4555-8555-555555555555",
        refresh_token_hash: "rthash",
        access_token_hash: "athash"
      })
    );
  });

  it("grants only the requested scopes for device_code exchange", async () => {
    getByDeviceCodeMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "AUTHORIZED",
      client_id: "openclaw",
      owner_id: "22222222-2222-2222-2222-222222222222",
      agent_id: "33333333-3333-4333-8333-333333333333",
      requested_scopes: ["watchlists:read", "threads:read"],
      requested_agent_name: "Integration OpenClaw",
      device_code_hash: "dhash",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      exchanged_at: null
    } as any);
    createInstallationMock.mockResolvedValue({
      installation_id: "44444444-4444-4444-4444-444444444444"
    } as any);
    issueRefreshMock.mockResolvedValue({
      refresh_token: "cd_rt_test",
      token_id: "55555555-5555-4555-8555-555555555555",
      token_hash: "rthash",
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    } as any);
    issueAccessMock.mockResolvedValue({
      access_token: "cd_at_test",
      access_token_hash: "athash",
      expires_in: 900
    } as any);
    markExchangedMock.mockResolvedValue({ authorization_id: "11111111-1111-1111-1111-111111111111" } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        client_id: "openclaw",
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: "cd_dev_test"
      }
    };

    const result: any = await handler(req, null, { authError: null, ip: "203.0.113.1", body: req.body });
    expect(result.status).toBe(200);
    expect(result.body.scope).toBe("watchlists:read threads:read");
    expect(issueRefreshMock).toHaveBeenCalledWith(expect.objectContaining({ scopes: ["watchlists:read", "threads:read"] }));
    expect(issueAccessMock).toHaveBeenCalledWith(expect.objectContaining({ scopes: ["watchlists:read", "threads:read"] }));
  });

  it("returns invalid_grant for revoked refresh token", async () => {
    getRefreshMock.mockResolvedValue({
      tokenHash: "hash",
      record: {
        token_id: "t1",
        revoked_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        installation_id: "inst-1"
      }
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", grant_type: "refresh_token", refresh_token: "cd_rt_bad" }
    };
    const ctx: any = { authError: null, ip: "203.0.113.1", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("invalid_grant");
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(ctx.body?.refresh_token).toBeUndefined();
  });

  it("rotates refresh token and issues a new access token", async () => {
    getRefreshMock.mockResolvedValue({
      tokenHash: "hash",
      record: {
        token_id: "old",
        revoked_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        installation_id: "inst-1"
      }
    } as any);

    rotateMock.mockResolvedValue({
      old_token_id: "old",
      new_refresh_token: "cd_rt_new",
      new_token_id: "new",
      new_token_hash: "newhash",
      new_expires_at: new Date(Date.now() + 60_000).toISOString(),
      owner_id: "owner-1",
      agent_id: "agent-1",
      installation_id: "inst-1",
      scopes: ["agent:read"]
    } as any);

    issueAccessMock.mockResolvedValue({
      access_token: "cd_at_new",
      access_token_hash: "athash2",
      expires_in: 900,
      expires_at: new Date(Date.now() + 900_000).toISOString(),
      issued_at: new Date().toISOString()
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", grant_type: "refresh_token", refresh_token: "cd_rt_old" }
    };
    const ctx: any = { authError: null, ip: "203.0.113.1", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.refresh_token).toBe("cd_rt_new");
    expect(result.body.access_token).toBe("cd_at_new");
    expect(result.body.scope).toBe(V1_SCOPES_DEFAULT.join(" "));
    expect(ctx.auditEvent).toBe("oauth.token_refreshed");

    expect(rateLimitMiddleware).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        routeGroup: "oauth.token",
        agentId: "inst-1",
        useIpFallback: false,
        ip: "203.0.113.1"
      })
    );
  });

  it("does not rotate refresh token when access-token issuance fails", async () => {
    getRefreshMock.mockResolvedValue({
      tokenHash: "hash",
      record: {
        token_id: "old",
        revoked_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        installation_id: "inst-1"
      }
    } as any);

    issueAccessMock.mockRejectedValue({
      status: 503,
      code: "AUTH_UNAVAILABLE",
      message: "Failed to issue access token"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", grant_type: "refresh_token", refresh_token: "cd_rt_old" }
    };
    const ctx: any = { authError: null, ip: "203.0.113.1", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("AUTH_UNAVAILABLE");
    expect(rotateRefreshToken).not.toHaveBeenCalled();
  });

  it("does not rotate a refresh token when its OAuth principal is suspended", async () => {
    getRefreshMock.mockResolvedValue({
      tokenHash: "hash",
      record: {
        token_id: "old",
        owner_id: "owner-1",
        agent_id: "agent-1",
        revoked_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        installation_id: "inst-1"
      }
    } as any);
    issueAccessMock.mockRejectedValue({
      status: 401,
      code: "invalid_grant",
      message: "OAuth principal is not active"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", grant_type: "refresh_token", refresh_token: "cd_rt_suspended" }
    };

    const result: any = await handler(req, null, { authError: null, ip: "203.0.113.1", body: req.body });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("invalid_grant");
    expect(rotateRefreshToken).not.toHaveBeenCalled();
  });

  it("returns invalid_grant and revokes issued access token when rotation loses refresh race", async () => {
    getRefreshMock.mockResolvedValue({
      tokenHash: "hash",
      record: {
        token_id: "old",
        revoked_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        installation_id: "inst-1"
      }
    } as any);

    issueAccessMock.mockResolvedValue({
      access_token: "cd_at_new",
      access_token_hash: "athash2",
      expires_in: 900,
      expires_at: new Date(Date.now() + 900_000).toISOString(),
      issued_at: new Date().toISOString()
    } as any);

    rotateMock.mockRejectedValue({
      status: 401,
      code: "invalid_grant",
      message: "Invalid refresh token"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", grant_type: "refresh_token", refresh_token: "cd_rt_old" }
    };

    const result: any = await handler(req, null, { authError: null, ip: "203.0.113.1", body: req.body });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("invalid_grant");
    expect(deleteAccessByHashMock).toHaveBeenCalledWith("athash2");
  });

  it("fails closed on rotation server errors and revokes issued access token", async () => {
    getRefreshMock.mockResolvedValue({
      tokenHash: "hash",
      record: {
        token_id: "old",
        revoked_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        installation_id: "inst-1"
      }
    } as any);

    issueAccessMock.mockResolvedValue({
      access_token: "cd_at_new",
      access_token_hash: "athash2",
      expires_in: 900,
      expires_at: new Date(Date.now() + 900_000).toISOString(),
      issued_at: new Date().toISOString()
    } as any);

    rotateMock.mockRejectedValue({
      status: 503,
      code: "ROTATION_UNAVAILABLE",
      message: "Failed to rotate refresh token"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", grant_type: "refresh_token", refresh_token: "cd_rt_old" }
    };

    const result: any = await handler(req, null, { authError: null, ip: "203.0.113.1", body: req.body });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("ROTATION_UNAVAILABLE");
    expect(deleteAccessByHashMock).toHaveBeenCalledWith("athash2");
  });
});
