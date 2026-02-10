import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../server/rate-limit/middleware", () => ({
  rateLimitMiddleware: vi.fn().mockResolvedValue(null)
}));

vi.mock("../../../server/services/oauth-refresh-tokens", () => ({
  getOauthRefreshTokenRecordByToken: vi.fn(),
  revokeRefreshToken: vi.fn()
}));

import { handler } from "../../../pages/api/oauth/revoke";
import { rateLimitMiddleware } from "../../../server/rate-limit/middleware";
import { getOauthRefreshTokenRecordByToken, revokeRefreshToken } from "../../../server/services/oauth-refresh-tokens";

const getRefreshMock = vi.mocked(getOauthRefreshTokenRecordByToken);
const revokeMock = vi.mocked(revokeRefreshToken);
const rateLimitMock = vi.mocked(rateLimitMiddleware);

describe("POST /oauth/revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue(null as any);
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
    revokeMock.mockResolvedValue({
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
        ownerId: "owner-1"
      })
    );
  });

  it("returns 200 {} even when token is invalid/unknown (no probing)", async () => {
    getRefreshMock.mockResolvedValue(null as any);
    revokeMock.mockRejectedValue({ status: 404, code: "invalid_grant", message: "Invalid refresh token" } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", token_type_hint: "refresh_token", token: "cd_rt_unknown" }
    };
    const ctx: any = { authError: null, ip: "203.0.113.1", body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({});
  });
});
