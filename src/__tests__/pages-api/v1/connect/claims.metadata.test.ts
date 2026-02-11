import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/connect-sessions", () => ({
  getConnectSessionByClaimToken: vi.fn()
}));

vi.mock("../../../../server/services/agents", () => ({
  getOwnerAgentLimit: vi.fn(),
  listOwnerAgentsForClaim: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/connect/claims/[claim_token]";
import { getConnectSessionByClaimToken } from "../../../../server/services/connect-sessions";
import { getOwnerAgentLimit, listOwnerAgentsForClaim } from "../../../../server/services/agents";

const getConnectSessionByClaimTokenMock = vi.mocked(getConnectSessionByClaimToken);
const getOwnerAgentLimitMock = vi.mocked(getOwnerAgentLimit);
const listOwnerAgentsForClaimMock = vi.mocked(listOwnerAgentsForClaim);

const baseCtx: any = { authError: null };

describe("GET /v1/connect/claims/:claim_token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOwnerAgentLimitMock.mockReturnValue(1);
    listOwnerAgentsForClaimMock.mockResolvedValue([]);
  });

  it("requires claim_token", async () => {
    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("redacts claim_token in ctx on method not allowed (audit safety)", async () => {
    const req = { method: "POST", query: { claim_token: "cd_claim_test" } };
    const ctx: any = {
      ...baseCtx,
      path: "/api/v1/connect/claims/cd_claim_test",
      query: { claim_token: "cd_claim_test" }
    };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(405);
    expect(ctx.path).toBe("/api/v1/connect/claims");
    expect(ctx.query).toEqual({});
  });

  it("redacts claim_token in ctx on auth error early return (audit safety)", async () => {
    const req = { method: "GET", query: { claim_token: "cd_claim_test" } };
    const ctx: any = {
      ...baseCtx,
      authError: { status: 401, code: "AUTH_ERROR", message: "Invalid token" },
      path: "/api/v1/connect/claims/cd_claim_test",
      query: { claim_token: "cd_claim_test" }
    };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(401);
    expect(ctx.path).toBe("/api/v1/connect/claims");
    expect(ctx.query).toEqual({});
    expect(getConnectSessionByClaimToken).not.toHaveBeenCalled();
  });

  it("returns connect session metadata", async () => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: "11111111-1111-1111-1111-111111111111",
      status: "PENDING_CLAIM",
      requested_agent_name: "OpenClaw",
      requested_scopes: null,
      client_type: "openclaw",
      client_version: "1.0.0",
      expires_at: "2026-02-10T12:00:00.000Z",
      claimed_at: null
    } as any);

    const ctx: any = { ...baseCtx };
    const req = { method: "GET", query: { claim_token: "cd_claim_test" } };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.data.session_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.body.data.requested_agent_name).toBe("OpenClaw");
    expect(result.body.data.requested_scopes).toEqual([]);
    expect(result.body.data.client_type).toBe("openclaw");
    expect(result.body.data.client_version).toBe("1.0.0");
    expect(result.body.data.expires_at).toBe("2026-02-10T12:00:00.000Z");
    expect(result.body.data.claimed_at).toBeNull();
    expect(result.body.data.owner_context_available).toBe(false);
    expect(result.body.data.owner_agent_limit).toBeUndefined();
    expect(result.body.data.owner_agents).toBeUndefined();

    expect(getConnectSessionByClaimToken).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: "cd_claim_test",
        now: expect.any(Date)
      })
    );

    expect(ctx.auditEvent).toBe("connect.claim_viewed");
    expect(ctx.auditEntityType).toBe("connect_session");
    expect(ctx.auditEntityId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("includes owner-agent context for cookie-authenticated owner requests", async () => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: "11111111-1111-1111-1111-111111111111",
      status: "PENDING_CLAIM",
      requested_agent_name: "OpenClaw",
      requested_scopes: [],
      client_type: "openclaw",
      client_version: "1.0.0",
      expires_at: "2026-02-10T12:00:00.000Z",
      claimed_at: null
    } as any);
    getOwnerAgentLimitMock.mockReturnValue(1);
    listOwnerAgentsForClaimMock.mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Existing Agent",
        status: "active",
        created_at: "2026-02-10T11:00:00.000Z"
      }
    ] as any);

    const ctx: any = {
      ...baseCtx,
      ownerId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      ownerSessionId: "77777777-7777-4777-8777-777777777777",
      actor: { type: "owner", id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" }
    };
    const req = { method: "GET", query: { claim_token: "cd_claim_test" } };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.data.owner_context_available).toBe(true);
    expect(result.body.data.owner_agent_limit).toBe(1);
    expect(result.body.data.owner_agents).toEqual([
      {
        agent_id: "22222222-2222-4222-8222-222222222222",
        name: "Existing Agent",
        status: "active"
      }
    ]);
    expect(result.body.data.allow_create_agent).toBe(false);
    expect(result.body.data.default_mode).toBe("attach_agent");
  });

  it("does not expose owner-agent context for header-stub owner traffic", async () => {
    getConnectSessionByClaimTokenMock.mockResolvedValue({
      session_id: "11111111-1111-1111-1111-111111111111",
      status: "PENDING_CLAIM",
      requested_agent_name: "OpenClaw",
      requested_scopes: [],
      client_type: "openclaw",
      client_version: "1.0.0",
      expires_at: "2026-02-10T12:00:00.000Z",
      claimed_at: null
    } as any);

    const ctx: any = {
      ...baseCtx,
      ownerId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      actor: { type: "owner", id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" }
    };
    const req = { method: "GET", query: { claim_token: "cd_claim_test" } };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.data.owner_context_available).toBe(false);
    expect(result.body.data.owner_agent_limit).toBeUndefined();
    expect(result.body.data.owner_agents).toBeUndefined();
    expect(getOwnerAgentLimit).not.toHaveBeenCalled();
    expect(listOwnerAgentsForClaim).not.toHaveBeenCalled();
  });
});
