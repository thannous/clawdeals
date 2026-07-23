import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn(),
  mapSupabaseError: vi.fn((error: any) => ({
    message: error?.message || "Database error",
    status: error?.status || 500,
    code: error?.code || "DATABASE_ERROR"
  }))
}));

vi.mock("../../../../server/db/supabase", () => ({
  getSupabaseServiceClient: mocks.getSupabaseServiceClient
}));

vi.mock("../../../../server/services/supabase-errors", () => ({
  mapSupabaseError: mocks.mapSupabaseError
}));

vi.mock("../../../../server/services/channel-identities", () => ({
  getChannelIdentity: vi.fn(),
  denyPairing: vi.fn(),
  revokePairing: vi.fn()
}));

vi.mock("../../../../server/services/approvals", () => ({
  resolveApproval: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/channels/[id_action]";
import {
  denyPairing,
  getChannelIdentity,
  revokePairing
} from "../../../../server/services/channel-identities";
import { resolveApproval } from "../../../../server/services/approvals";

const ownerId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";

const getMock = vi.mocked(getChannelIdentity);
const denyMock = vi.mocked(denyPairing);
const revokeMock = vi.mocked(revokePairing);
const resolveApprovalMock = vi.mocked(resolveApproval);

function makeCtx(overrides: any = {}) {
  return {
    authError: null,
    ownerId,
    actor: { type: "owner", id: ownerId },
    ...overrides
  } as any;
}

function makeApprovalQuery(data: any) {
  const query: any = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return query;
}

describe("POST /v1/channels/:id:revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed and unsupported actions before reading channel state", async () => {
    const malformed: any = await handler(
      { method: "POST", query: { id_action: "not-a-uuid:revoke" } },
      null,
      makeCtx()
    );
    const unsupported: any = await handler(
      { method: "POST", query: { id_action: `${channelId}:approve` } },
      null,
      makeCtx()
    );

    expect(malformed.status).toBe(400);
    expect(unsupported.status).toBe(404);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("is idempotent for an already revoked owner-scoped channel", async () => {
    getMock.mockResolvedValue({
      channel_identity_id: channelId,
      state: "REVOKED",
      channel_type: "telegram"
    } as any);

    const result: any = await handler(
      { method: "POST", query: { id_action: `${channelId}:revoke` } },
      null,
      makeCtx()
    );

    expect(result.status).toBe(200);
    expect(result.body.data.channel).toMatchObject({
      channel_account_id: channelId,
      state: "REVOKED"
    });
    expect(getMock).toHaveBeenCalledWith({
      ownerId,
      channelIdentityId: channelId
    });
    expect(revokeMock).not.toHaveBeenCalled();
    expect(denyMock).not.toHaveBeenCalled();
  });

  it("revokes an active channel with owner scoping and audit attribution", async () => {
    getMock.mockResolvedValue({
      channel_identity_id: channelId,
      state: "ACTIVE",
      channel_type: "telegram"
    } as any);
    revokeMock.mockResolvedValue({
      channel_identity_id: channelId,
      state: "REVOKED",
      channel_type: "telegram"
    } as any);
    const ctx = makeCtx();

    const result: any = await handler(
      { method: "POST", query: { id_action: `${channelId}:revoke` } },
      null,
      ctx
    );

    expect(result.status).toBe(200);
    expect(revokeMock).toHaveBeenCalledWith({
      ownerId,
      channelIdentityId: channelId,
      revokedBy: ownerId
    });
    expect(ctx.auditEvent).toBe("channel.revoked");
  });

  it("resolves a pending approval as denied before returning refreshed channel state", async () => {
    getMock
      .mockResolvedValueOnce({
        channel_identity_id: channelId,
        state: "PENDING",
        channel_type: "telegram"
      } as any)
      .mockResolvedValueOnce({
        channel_identity_id: channelId,
        state: "REVOKED",
        channel_type: "telegram"
      } as any);
    const approvalQuery = makeApprovalQuery({ approval_id: "approval-1" });
    mocks.getSupabaseServiceClient.mockReturnValue({
      from: vi.fn(() => approvalQuery)
    });

    const result: any = await handler(
      { method: "POST", query: { id_action: `${channelId}:revoke` } },
      null,
      makeCtx()
    );

    expect(result.status).toBe(200);
    expect(resolveApprovalMock).toHaveBeenCalledWith({
      approvalId: "approval-1",
      ownerId,
      decision: "DENIED",
      resolvedBy: ownerId,
      reason: "revoked"
    });
    expect(approvalQuery.eq).toHaveBeenNthCalledWith(1, "owner_id", ownerId);
    expect(approvalQuery.eq).toHaveBeenNthCalledWith(2, "action_type", "channel.pair");
    expect(approvalQuery.eq).toHaveBeenNthCalledWith(3, "action_ref_id", channelId);
    expect(approvalQuery.eq).toHaveBeenNthCalledWith(4, "state", "PENDING");
    expect(denyMock).not.toHaveBeenCalled();
  });

  it("directly denies a pending pairing when no approval exists", async () => {
    getMock.mockResolvedValue({
      channel_identity_id: channelId,
      state: "PENDING",
      channel_type: "telegram"
    } as any);
    denyMock.mockResolvedValue({
      channel_identity_id: channelId,
      state: "REVOKED",
      channel_type: "telegram"
    } as any);
    mocks.getSupabaseServiceClient.mockReturnValue({
      from: vi.fn(() => makeApprovalQuery(null))
    });

    const result: any = await handler(
      { method: "POST", query: { id_action: `${channelId}:revoke` } },
      null,
      makeCtx()
    );

    expect(result.status).toBe(200);
    expect(denyMock).toHaveBeenCalledWith({
      ownerId,
      channelIdentityId: channelId,
      deniedBy: ownerId
    });
    expect(resolveApprovalMock).not.toHaveBeenCalled();
  });
});
