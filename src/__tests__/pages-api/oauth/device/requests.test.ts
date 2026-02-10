import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/oauth-device-authorizations", () => ({
  getOauthDeviceAuthorizationByUserCode: vi.fn()
}));

import { handler } from "../../../../pages/api/oauth/device/requests";
import { getOauthDeviceAuthorizationByUserCode } from "../../../../server/services/oauth-device-authorizations";

const getMock = vi.mocked(getOauthDeviceAuthorizationByUserCode);

describe("GET /oauth/device/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires user_code", async () => {
    const req: any = { method: "GET", headers: {}, query: {} };
    const result: any = await handler(req, null, { authError: null });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns NOT_FOUND when missing", async () => {
    getMock.mockRejectedValue({ status: 404, code: "DEVICE_AUTHORIZATION_NOT_FOUND", message: "not found" });

    const req: any = { method: "GET", headers: {}, query: { user_code: "ABCD-EFGH" } };
    const result: any = await handler(req, null, { authError: null });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("DEVICE_AUTHORIZATION_NOT_FOUND");
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
    const result: any = await handler(req, null, { authError: null });
    expect(result.status).toBe(200);
    expect(result.body.data.authorization_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.body.data.status).toBe("PENDING");
    expect(result.body.data.client_id).toBe("openclaw");
    expect(result.body.data.requested_scopes).toEqual(["agent:read"]);
  });
});

