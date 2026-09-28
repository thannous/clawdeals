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

vi.mock("../../../../server/services/threads", () => ({
  createOrGetControlDmThread: vi.fn()
}));

vi.mock("../../../../server/services/owners", () => ({
  getOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/oauth/device/approve";
import {
  approveOauthDeviceAuthorization,
  getOauthDeviceAuthorizationByUserCode
} from "../../../../server/services/oauth-device-authorizations";
import { createAgent, getAgentById } from "../../../../server/services/agents";
import { createOrGetControlDmThread } from "../../../../server/services/threads";
import { getOwner } from "../../../../server/services/owners";

const getAuthMock = vi.mocked(getOauthDeviceAuthorizationByUserCode);
const approveMock = vi.mocked(approveOauthDeviceAuthorization);
const createAgentMock = vi.mocked(createAgent);
const getAgentByIdMock = vi.mocked(getAgentById);
const createOrGetControlDmThreadMock = vi.mocked(createOrGetControlDmThread);
const getOwnerMock = vi.mocked(getOwner);

const ownerId = "00000000-0000-4000-a000-000000000123";

const baseCtx: any = {
  authError: null,
  ownerId,
  actor: { type: "owner", id: ownerId }
};

describe("POST /oauth/device/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOwnerMock.mockResolvedValue({
      owner_id: ownerId,
      email_verified_at: "2026-02-10T12:00:00.000Z"
    } as any);
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

  it("keeps approval successful when control DM creation fails", async () => {
    getAuthMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "PENDING",
      client_id: "openclaw",
      requested_agent_name: "OpenClaw"
    } as any);

    createAgentMock.mockResolvedValue({ id: "22222222-2222-2222-2222-222222222222" } as any);
    approveMock.mockResolvedValue({
      authorization_id: "11111111-1111-1111-1111-111111111111",
      status: "AUTHORIZED",
      owner_id: ownerId,
      agent_id: "22222222-2222-2222-2222-222222222222",
      authorized_at: "2026-02-10T12:00:00.000Z"
    } as any);
    createOrGetControlDmThreadMock.mockRejectedValue(new Error("db down"));

    const req: any = {
      method: "POST",
      headers: { "idempotency-key": "k1" },
      body: { user_code: "ABCD-EFGH", mode: "create_agent", agent_name: "My Agent" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.data.status).toBe("AUTHORIZED");
  });
});
