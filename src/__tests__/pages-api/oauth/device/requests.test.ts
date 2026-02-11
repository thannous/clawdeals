import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/oauth-device-authorizations", () => ({
  getOauthDeviceAuthorizationByUserCode: vi.fn(),
  assertOauthDeviceUserCodeLookupAllowed: vi.fn(),
  recordOauthDeviceUserCodeLookupAttempt: vi.fn()
}));

import { handler } from "../../../../pages/api/oauth/device/requests";
import {
  assertOauthDeviceUserCodeLookupAllowed,
  getOauthDeviceAuthorizationByUserCode,
  recordOauthDeviceUserCodeLookupAttempt
} from "../../../../server/services/oauth-device-authorizations";

const getMock = vi.mocked(getOauthDeviceAuthorizationByUserCode);
const assertLookupAllowedMock = vi.mocked(assertOauthDeviceUserCodeLookupAllowed);
const recordLookupAttemptMock = vi.mocked(recordOauthDeviceUserCodeLookupAttempt);

describe("GET /oauth/device/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertLookupAllowedMock.mockResolvedValue(null as any);
    recordLookupAttemptMock.mockResolvedValue(null as any);
  });

  it("requires user_code", async () => {
    const req: any = { method: "GET", headers: {}, query: {} };
    const result: any = await handler(req, null, { authError: null });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.headers["Cache-Control"]).toBe("no-store");
  });

  it("returns NOT_FOUND when missing", async () => {
    getMock.mockRejectedValue({ status: 404, code: "DEVICE_AUTHORIZATION_NOT_FOUND", message: "not found" });

    const req: any = { method: "GET", headers: {}, query: { user_code: "ABCD-EFGH" } };
    const result: any = await handler(req, null, { authError: null, ip: "203.0.113.1" });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("DEVICE_AUTHORIZATION_NOT_FOUND");
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(recordLookupAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userCode: "ABCD-EFGH",
        matched: false,
        success: false
      })
    );
  });

  it("returns request view", async () => {
    getMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "PENDING",
      client_id: "openclaw",
      requested_scopes: ["agent:read"],
      requested_agent_name: "OpenClaw",
      expires_at: "2026-02-10T12:00:00.000Z",
      owner_id: null,
      agent_id: null,
      authorized_at: null,
      denied_at: null
    } as any);

    const req: any = { method: "GET", headers: {}, query: { user_code: "ABCD-EFGH" } };
    const result: any = await handler(req, null, { authError: null, ip: "203.0.113.1" });
    expect(result.status).toBe(200);
    expect(result.body.data.authorization_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.body.data.status).toBe("PENDING");
    expect(result.body.data.client_id).toBe("openclaw");
    expect(result.body.data.requested_scopes).toEqual(["agent:read"]);
    expect(result.headers["Cache-Control"]).toBe("no-store");

    expect(assertLookupAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userCode: "ABCD-EFGH",
        ip: "203.0.113.1"
      })
    );
    expect(recordLookupAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userCode: "ABCD-EFGH",
        matched: true,
        success: true
      })
    );
  });

  it("returns lockout response from guard hook", async () => {
    assertLookupAllowedMock.mockResolvedValue({
      status: 429,
      code: "DEVICE_AUTHORIZATION_LOCKED",
      message: "Too many attempts",
      retry_after_seconds: 30
    } as any);

    const ctx: any = { authError: null, ip: "203.0.113.1" };
    const req: any = { method: "GET", headers: {}, query: { user_code: "ABCD-EFGH" } };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(429);
    expect(result.body.error.code).toBe("DEVICE_AUTHORIZATION_LOCKED");
    expect(result.headers["Retry-After"]).toBe("30");
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(ctx.outcome).toEqual({ type: "BLOCKED", reason: "lockout" });
    expect(getMock).not.toHaveBeenCalled();
  });
});
