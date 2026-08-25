import crypto from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/oauth-device-authorizations", () => ({
  createOauthDeviceAuthorization: vi.fn()
}));

import { handler } from "../../../../pages/api/oauth/device/authorize";
import { createOauthDeviceAuthorization } from "../../../../server/services/oauth-device-authorizations";
import { V1_SCOPES_DEFAULT } from "../../../../shared/scopes/v1";

const createMock = vi.mocked(createOauthDeviceAuthorization);

const baseCtx: any = {
  authError: null,
  ip: "203.0.113.42",
  userAgent: "Mozilla/5.0 UnitTest"
};

describe("POST /oauth/device/authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires client_id", async () => {
    const req: any = { method: "POST", headers: {}, body: {} };
    const ctx: any = { ...baseCtx };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown client_id", async () => {
    const req: any = { method: "POST", headers: {}, body: { client_id: "nope" } };
    const ctx: any = { ...baseCtx };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates requested_agent_name length", async () => {
    const req: any = {
      method: "POST",
      headers: {},
      body: { client_id: "openclaw", requested_agent_name: "x".repeat(81) }
    };
    const ctx: any = { ...baseCtx };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown scopes before creating a device authorization", async () => {
    const req: any = {
      method: "POST",
      headers: {},
      body: { client_id: "openclaw", scope: "deals:read admin:everything" }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("INVALID_SCOPE");
    expect(result.body.error.details.unknown_scopes).toEqual(["admin:everything"]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates device authorization and returns RFC-shaped response", async () => {
    createMock.mockResolvedValue({
      authorization: {
        authorization_id: "11111111-1111-1111-1111-111111111111",
        client_id: "openclaw",
        device_code_hash: "dhash",
        user_code_hash: "uhash"
      },
      device_code: "cd_dev_test",
      user_code: "ABCD-EFGH"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { client_id: "openclaw", scope: "agent:read agent:write", requested_agent_name: "OpenClaw" }
    };
    const ctx: any = { ...baseCtx };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.device_code).toBe("cd_dev_test");
    expect(result.body.user_code).toBe("ABCD-EFGH");
    expect(result.body.verification_uri).toContain("/device");
    expect(result.body.verification_uri_complete).toContain("user_code=ABCD-EFGH");
    expect(result.body.expires_in).toBe(600);
    expect(result.body.interval).toBe(2);

    const expectedUaHash = crypto.createHash("sha256").update(baseCtx.userAgent).digest("hex");
    expect(createOauthDeviceAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "openclaw",
        requestedScopes: V1_SCOPES_DEFAULT,
        requestedAgentName: "OpenClaw",
        ipTruncated: "203.0.113.0",
        uaHash: expectedUaHash,
        now: expect.any(Date)
      })
    );

    expect(ctx.auditEvent).toBe("oauth.device_authorize");
    expect(ctx.auditEntityType).toBe("oauth_device_authorization");
    expect(ctx.auditEntityId).toBe("11111111-1111-1111-1111-111111111111");
    expect(ctx.security).toEqual(
      expect.objectContaining({
        authorization_id: "11111111-1111-1111-1111-111111111111",
        client_id: "openclaw",
        device_code_hash: "dhash",
        user_code_hash: "uhash"
      })
    );
  });
});
