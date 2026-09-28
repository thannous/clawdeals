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
});
