import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/oauth-device-authorizations", () => ({
  getOauthDeviceAuthorizationByUserCode: vi.fn(),
  approveOauthDeviceAuthorization: vi.fn()
}));

vi.mock("../../../../server/services/agents", () => ({
  createAgent: vi.fn(),
  getAgentById: vi.fn(),
  deleteAgentById: vi.fn()
}));

import { handler } from "../../../../pages/api/oauth/device/approve";
import {
  approveOauthDeviceAuthorization,
  getOauthDeviceAuthorizationByUserCode
} from "../../../../server/services/oauth-device-authorizations";
import { createAgent, getAgentById } from "../../../../server/services/agents";

const getAuthMock = vi.mocked(getOauthDeviceAuthorizationByUserCode);
const approveMock = vi.mocked(approveOauthDeviceAuthorization);
const createAgentMock = vi.mocked(createAgent);
const getAgentByIdMock = vi.mocked(getAgentById);

const ownerId = "00000000-0000-4000-a000-000000000123";

const baseCtx: any = {
  authError: null,
  ownerId,
  actor: { type: "owner", id: ownerId }
};

describe("POST /oauth/device/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires Idempotency-Key", async () => {
    const req: any = { method: "POST", headers: {}, body: { user_code: "ABCD-EFGH" } };
    const ctx: any = { ...baseCtx };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(ctx.body?.user_code).toBeUndefined();
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

  it("sanitizes ctx.body (never stores plaintext user_code)", async () => {
    getAuthMock.mockRejectedValue({ status: 400, code: "VALIDATION_ERROR", message: "userCode is invalid" });

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      body: { user_code: "bad-code", mode: "create_agent" }
    };
    const ctx: any = { ...baseCtx, body: req.body };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(ctx.body?.user_code).toBeUndefined();
  });

  it("approves via create_agent", async () => {
    getAuthMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "PENDING",
      client_id: "openclaw",
      requested_agent_name: "OpenClaw",
      device_code_hash: "dhash",
      user_code_hash: "uhash"
    } as any);

    createAgentMock.mockResolvedValue({ id: "22222222-2222-2222-2222-222222222222" } as any);

    approveMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "AUTHORIZED",
      owner_id: ownerId,
      agent_id: "22222222-2222-2222-2222-222222222222",
      authorized_at: "2026-02-10T12:00:00.000Z"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      body: { user_code: "ABCD-EFGH", mode: "create_agent", agent_name: "My Agent" }
    };
    const ctx: any = { ...baseCtx };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.status).toBe("AUTHORIZED");
    expect(result.body.data.owner_id).toBe(ownerId);

    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId,
        name: "My Agent",
        metadata: expect.objectContaining({
          oauth_client_id: "openclaw",
          oauth_device_authorization_id: "11111111-1111-1111-1111-111111111111"
        })
      })
    );

    expect(ctx.auditEvent).toBe("oauth.device_approved");
    expect(ctx.body?.user_code).toBeUndefined();
  });

  it("approves via attach_agent", async () => {
    getAuthMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "PENDING",
      client_id: "openclaw",
      requested_agent_name: "OpenClaw"
    } as any);

    getAgentByIdMock.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", owner_id: ownerId } as any);

    approveMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "AUTHORIZED",
      owner_id: ownerId,
      agent_id: "33333333-3333-4333-8333-333333333333",
      authorized_at: "2026-02-10T12:00:00.000Z"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      body: { user_code: "ABCD-EFGH", mode: "attach_agent", attach_agent_id: "33333333-3333-4333-8333-333333333333" }
    };
    const ctx: any = { ...baseCtx };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.agent_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("returns conflict when already authorized", async () => {
    getAuthMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "AUTHORIZED",
      client_id: "openclaw"
    } as any);

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      body: { user_code: "ABCD-EFGH", mode: "create_agent" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(409);
    expect(approveOauthDeviceAuthorization).not.toHaveBeenCalled();
  });
});
