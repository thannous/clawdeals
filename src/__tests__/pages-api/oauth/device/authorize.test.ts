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
});
