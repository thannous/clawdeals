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

const getConnectSessionByClaimTokenMock = vi.mocked(getConnectSessionByClaimToken);
const claimConnectSessionMock = vi.mocked(claimConnectSession);
const denyConnectSessionMock = vi.mocked(denyConnectSession);

const createAgentWithOwnerLimitMock = vi.mocked(createAgentWithOwnerLimit);
const deleteAgentByIdMock = vi.mocked(deleteAgentById);
const getAgentByIdMock = vi.mocked(getAgentById);
const getOwnerAgentLimitMock = vi.mocked(getOwnerAgentLimit);
const createOrGetControlDmThreadMock = vi.mocked(createOrGetControlDmThread);

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
  });

  it("requires Idempotency-Key", async () => {
    const req = {
      method: "POST",
      headers: {},
      query: { session_id: sessionId },
      body: { claim_token: claimToken }
    };

    const result: any = await claimHandler(req, null, { ...baseOwnerCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates session_id as UUID", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: "not-a-uuid" },
      body: { claim_token: claimToken }
    };

    const result: any = await claimHandler(req, null, { ...baseOwnerCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires owner authentication", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: { claim_token: claimToken }
    };

    const result: any = await claimHandler(req, null, { ...baseOwnerCtx, ownerId: null, actor: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates claim_token", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: {}
    };

    const result: any = await claimHandler(req, null, { ...baseOwnerCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
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

  it("claims session (create_agent mode)", async () => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: sessionId,
      status: "PENDING_CLAIM",
      requested_agent_name: "OpenClaw",
      requested_scopes: ["agent:read"],
      client_type: "openclaw",
      client_version: "1.0.0"
    } as any);

    createAgentWithOwnerLimitMock.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" } as any);
    createOrGetControlDmThreadMock.mockResolvedValue({
      thread: { thread_id: "99999999-9999-4999-8999-999999999999" },
      created: true
    } as any);

    claimConnectSessionMock.mockResolvedValue({
      session_id: sessionId,
      status: "CLAIMED",
      owner_id: ownerId,
      agent_id: "22222222-2222-4222-8222-222222222222",
      claimed_at: "2026-02-10T12:00:00.000Z"
    } as any);

    const ctx: any = { ...baseOwnerCtx };
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

    const result: any = await claimHandler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.data.session_id).toBe(sessionId);
    expect(result.body.data.status).toBe("CLAIMED");
    expect(result.body.data.owner_id).toBe(ownerId);
    expect(result.body.data.agent_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.body.data.claimed_at).toBe("2026-02-10T12:00:00.000Z");

    expect(createAgentWithOwnerLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId,
        ownerAgentLimit: 1,
        name: "My Agent",
        metadata: {
          connect_client_type: "openclaw",
          connect_client_version: "1.0.0",
          connect_session_id: sessionId
        }
      })
    );

    expect(claimConnectSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        claimToken,
        ownerId,
        agentId: "22222222-2222-4222-8222-222222222222",
        installationId: null,
        now: expect.any(Date)
      })
    );
    expect(createOrGetControlDmThread).toHaveBeenCalledWith({
      ownerId,
      agentId: "22222222-2222-4222-8222-222222222222"
    });

    expect(ctx.auditEvent).toBe("connect.session_claimed");
    expect(ctx.auditEntityType).toBe("connect_session");
    expect(ctx.auditEntityId).toBe(sessionId);
  });

  it("returns 409 when owner has reached OWNER_AGENT_LIMIT in create mode", async () => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: sessionId,
      status: "PENDING_CLAIM",
      requested_agent_name: "OpenClaw",
      requested_scopes: []
    } as any);
    getOwnerAgentLimitMock.mockReturnValue(1);
    createAgentWithOwnerLimitMock.mockRejectedValue(
      Object.assign(new Error("Owner agent limit reached"), {
        status: 409,
        code: "OWNER_AGENT_LIMIT_REACHED",
        details: { owner_agent_limit: 1 }
      })
    );

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: {
        claim_token: claimToken,
        mode: "create_agent",
        agent_name: "Should Not Create"
      }
    };

    const result: any = await claimHandler(req, null, { ...baseOwnerCtx });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("OWNER_AGENT_LIMIT_REACHED");
    expect(createAgentWithOwnerLimit).toHaveBeenCalledTimes(1);
    expect(claimConnectSession).not.toHaveBeenCalled();
  });

  it("maps status conflicts to 409 (already claimed)", async () => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: sessionId,
      status: "CLAIMED",
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
    expect(result.body.error.code).toBe("SESSION_ALREADY_CLAIMED");
    expect(createAgentWithOwnerLimit).not.toHaveBeenCalled();
    expect(claimConnectSession).not.toHaveBeenCalled();
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

  it("claims session (attach_agent mode)", async () => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: sessionId,
      status: "PENDING_CLAIM",
      requested_agent_name: "OpenClaw",
      requested_scopes: [],
      client_type: "openclaw",
      client_version: "1.0.0"
    } as any);

    getAgentByIdMock.mockResolvedValue({ id: attachAgentId, owner_id: ownerId } as any);
    createOrGetControlDmThreadMock.mockResolvedValue({
      thread: { thread_id: "99999999-9999-4999-8999-999999999999" },
      created: false
    } as any);

    claimConnectSessionMock.mockResolvedValue({
      session_id: sessionId,
      status: "CLAIMED",
      owner_id: ownerId,
      agent_id: attachAgentId,
      claimed_at: "2026-02-10T12:00:00.000Z"
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: {
        claim_token: claimToken,
        mode: "attach_agent",
        attach_agent_id: attachAgentId
      }
    };

    const result: any = await claimHandler(req, null, { ...baseOwnerCtx });
    expect(result.status).toBe(200);
    expect(result.body.data.agent_id).toBe(attachAgentId);
    expect(getAgentById).toHaveBeenCalledWith(attachAgentId);
    expect(createOrGetControlDmThread).toHaveBeenCalledWith({ ownerId, agentId: attachAgentId });
    expect(createAgentWithOwnerLimit).not.toHaveBeenCalled();
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
  });

  it("requires Idempotency-Key", async () => {
    const req = {
      method: "POST",
      headers: {},
      query: { session_id: sessionId },
      body: { claim_token: claimToken }
    };

    const result: any = await denyHandler(req, null, { ...baseOwnerCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
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

  it("requires owner authentication", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: { claim_token: claimToken }
    };

    const result: any = await denyHandler(req, null, { ...baseOwnerCtx, ownerId: null, actor: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates claim_token", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: {}
    };

    const result: any = await denyHandler(req, null, { ...baseOwnerCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("denies connect session", async () => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: sessionId,
      status: "PENDING_CLAIM",
      requested_agent_name: "OpenClaw"
    } as any);

    denyConnectSessionMock.mockResolvedValue({
      session_id: sessionId,
      status: "CANCELLED",
      cancelled_at: "2026-02-10T12:05:00.000Z"
    } as any);

    const ctx: any = { ...baseOwnerCtx };
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      query: { session_id: sessionId },
      body: { claim_token: claimToken }
    };

    const result: any = await denyHandler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.session_id).toBe(sessionId);
    expect(result.body.data.status).toBe("CANCELLED");
    expect(result.body.data.cancelled_at).toBe("2026-02-10T12:05:00.000Z");

    expect(denyConnectSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        claimToken,
        now: expect.any(Date)
      })
    );

    expect(ctx.auditEvent).toBe("connect.session_denied");
    expect(ctx.auditEntityType).toBe("connect_session");
    expect(ctx.auditEntityId).toBe(sessionId);
  });
});
