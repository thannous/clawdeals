import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/oauth-device-authorizations", () => ({
  denyOauthDeviceAuthorization: vi.fn()
}));

vi.mock("../../../../server/services/owners", () => ({
  getOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/oauth/device/deny";
import { denyOauthDeviceAuthorization } from "../../../../server/services/oauth-device-authorizations";
import { getOwner } from "../../../../server/services/owners";

const denyMock = vi.mocked(denyOauthDeviceAuthorization);
const getOwnerMock = vi.mocked(getOwner);

const ownerId = "00000000-0000-4000-a000-000000000123";

const baseCtx: any = {
  authError: null,
  ownerId,
  actor: { type: "owner", id: ownerId }
};

describe("POST /oauth/device/deny", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOwnerMock.mockResolvedValue({
      owner_id: ownerId,
      email_verified_at: "2026-02-10T12:00:00.000Z"
    } as any);
  });

  it("requires Idempotency-Key", async () => {
    const req: any = { method: "POST", headers: {}, body: { user_code: "ABCD-EFGH" } };
    const ctx: any = { ...baseCtx };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.headers["Cache-Control"]).toBe("no-store");
  });

  it("requires owner auth", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      body: { user_code: "ABCD-EFGH" }
    };

    const result: any = await handler(req, null, { authError: null, ownerId: null, actor: { type: "anonymous" } });
    expect(result.status).toBe(401);
  });

  it("rejects unverified owner", async () => {
    getOwnerMock.mockResolvedValue({
      owner_id: ownerId,
      email_verified_at: null
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      body: { user_code: "ABCD-EFGH" }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("OWNER_EMAIL_NOT_VERIFIED");
    expect(denyOauthDeviceAuthorization).not.toHaveBeenCalled();
  });

  it("requires user_code", async () => {
    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      body: {}
    };
    const ctx: any = { ...baseCtx, body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(ctx.body?.user_code).toBeUndefined();
  });

  it("sanitizes ctx.body (never stores plaintext user_code)", async () => {
    denyMock.mockRejectedValue({ status: 400, code: "VALIDATION_ERROR", message: "userCode is invalid" });

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      body: { user_code: "bad-code", extra: "ok" }
    };
    const ctx: any = { ...baseCtx, body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(ctx.body?.user_code).toBeUndefined();
    expect(ctx.body?.extra).toBe("ok");
  });

  it("denies and returns view", async () => {
    denyMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "DENIED",
      denied_at: "2026-02-10T12:00:00.000Z",
      client_id: "openclaw",
      device_code_hash: "dhash",
      user_code_hash: "uhash"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      body: { user_code: "  abcd-efgh  " }
    };
    const ctx: any = { ...baseCtx };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(result.body.data.authorization_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.body.data.status).toBe("DENIED");
    expect(result.body.data.denied_at).toBe("2026-02-10T12:00:00.000Z");

    expect(denyOauthDeviceAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        userCode: "abcd-efgh",
        now: expect.any(Date)
      })
    );

    expect(ctx.auditEvent).toBe("oauth.device_denied");
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
