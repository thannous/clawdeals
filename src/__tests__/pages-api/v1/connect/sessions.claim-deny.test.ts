import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/connect-sessions", () => ({
  claimConnectSession: vi.fn(),
  denyConnectSession: vi.fn(),
  getConnectSessionByClaimToken: vi.fn()
}));

vi.mock("../../../../server/services/agents", () => ({
  createAgentWithOwnerLimit: vi.fn(),
  deleteAgentById: vi.fn(),
  getAgentById: vi.fn(),
  getOwnerAgentLimit: vi.fn()
}));

vi.mock("../../../../server/services/threads", () => ({
  createOrGetControlDmThread: vi.fn()
}));

vi.mock("../../../../server/services/owners", () => ({
  getOwner: vi.fn()
}));

import { handler as claimHandler } from "../../../../pages/api/v1/connect/sessions/[session_id]/claim";
import { handler as denyHandler } from "../../../../pages/api/v1/connect/sessions/[session_id]/deny";

import {
  claimConnectSession,
  denyConnectSession,
  getConnectSessionByClaimToken
} from "../../../../server/services/connect-sessions";
import {
  createAgentWithOwnerLimit,
  deleteAgentById,
  getAgentById,
  getOwnerAgentLimit
} from "../../../../server/services/agents";
import { createOrGetControlDmThread } from "../../../../server/services/threads";
import { getOwner } from "../../../../server/services/owners";

const getConnectSessionByClaimTokenMock = vi.mocked(getConnectSessionByClaimToken);
const claimConnectSessionMock = vi.mocked(claimConnectSession);
const denyConnectSessionMock = vi.mocked(denyConnectSession);

const createAgentWithOwnerLimitMock = vi.mocked(createAgentWithOwnerLimit);
const deleteAgentByIdMock = vi.mocked(deleteAgentById);
const getAgentByIdMock = vi.mocked(getAgentById);
const getOwnerAgentLimitMock = vi.mocked(getOwnerAgentLimit);
const createOrGetControlDmThreadMock = vi.mocked(createOrGetControlDmThread);
const getOwnerMock = vi.mocked(getOwner);

const ownerId = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";
const sessionId = "11111111-1111-4111-8111-111111111111";
const claimToken = "cd_claim_test";
const attachAgentId = "44444444-4444-4444-8444-444444444444";

const baseOwnerCtx: any = {
  ownerId,
  agentId: null,
  actor: { type: "owner", id: ownerId },
  authError: null
};

describe("POST /v1/connect/sessions/:session_id/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOwnerAgentLimitMock.mockReturnValue(1);
    getOwnerMock.mockResolvedValue({
      owner_id: ownerId,
      email_verified_at: "2026-02-10T12:00:00.000Z"
    } as any);
  });

  it("blocks cookie-auth owner claims on cross-site requests", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: { claim_token: claimToken }
    };

    const result: any = await claimHandler(req, null, {
      ...baseOwnerCtx,
      ownerSessionId: "77777777-7777-4777-8777-777777777777"
    });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("CSRF_BLOCKED");
    expect(getConnectSessionByClaimToken).not.toHaveBeenCalled();
  });

  it.each([
    ["CANCELLED", "SESSION_CANCELLED"],
    ["EXPIRED", "SESSION_EXPIRED"]
  ])("maps status conflicts to 409 (%s)", async (status, expectedCode) => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: sessionId,
      status,
      requested_agent_name: "OpenClaw",
      requested_scopes: []
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: { claim_token: claimToken }
    };

    const result: any = await claimHandler(req, null, { ...baseOwnerCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe(expectedCode);
    expect(createAgentWithOwnerLimit).not.toHaveBeenCalled();
    expect(claimConnectSession).not.toHaveBeenCalled();
  });

  it("keeps claim successful when control DM creation fails", async () => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: sessionId,
      status: "PENDING_CLAIM",
      requested_agent_name: "OpenClaw",
      requested_scopes: []
    } as any);

    createAgentWithOwnerLimitMock.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" } as any);
    claimConnectSessionMock.mockResolvedValue({
      session_id: sessionId,
      status: "CLAIMED",
      owner_id: ownerId,
      agent_id: "22222222-2222-4222-8222-222222222222",
      claimed_at: "2026-02-10T12:00:00.000Z"
    } as any);
    createOrGetControlDmThreadMock.mockRejectedValue(new Error("db down"));

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: {
        claim_token: claimToken,
        mode: "create_agent",
        agent_name: "My Agent"
      }
    };

    const result: any = await claimHandler(req, null, { ...baseOwnerCtx });
    expect(result.status).toBe(200);
    expect(result.body.data.status).toBe("CLAIMED");
  });

  it("cleans up created agent when a claim loses the race (409)", async () => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: sessionId,
      status: "PENDING_CLAIM",
      requested_agent_name: "OpenClaw",
      requested_scopes: []
    } as any);

    createAgentWithOwnerLimitMock.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" } as any);
    claimConnectSessionMock.mockRejectedValue(
      Object.assign(new Error("Already claimed"), { status: 409, code: "CONNECT_SESSION_ALREADY_CLAIMED" })
    );
    deleteAgentByIdMock.mockResolvedValue(null as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: { claim_token: claimToken }
    };

    const result: any = await claimHandler(req, null, { ...baseOwnerCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("CONNECT_SESSION_ALREADY_CLAIMED");
    expect(deleteAgentById).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333");
  });
});

describe("POST /v1/connect/sessions/:session_id/deny", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOwnerAgentLimitMock.mockReturnValue(1);
    getOwnerMock.mockResolvedValue({
      owner_id: ownerId,
      email_verified_at: "2026-02-10T12:00:00.000Z"
    } as any);
  });

  it("blocks cookie-auth owner deny requests on cross-site requests", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: { claim_token: claimToken }
    };

    const result: any = await denyHandler(req, null, {
      ...baseOwnerCtx,
      ownerSessionId: "77777777-7777-4777-8777-777777777777"
    });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("CSRF_BLOCKED");
    expect(getConnectSessionByClaimToken).not.toHaveBeenCalled();
  });
});
