import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/channel-identities", () => ({
  getChannelIdentity: vi.fn(),
  revokePairing: vi.fn(),
  denyPairing: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/owner/identities/[identity_id]";
import { denyPairing, getChannelIdentity, revokePairing } from "../../../../server/services/channel-identities";

const ownerId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";

const getMock = vi.mocked(getChannelIdentity);
const revokeMock = vi.mocked(revokePairing);
const denyMock = vi.mocked(denyPairing);

function makeCtx(overrides: any = {}) {
  return { authError: null, ownerId, actor: { type: "owner", id: ownerId }, ...overrides } as any;
}

describe("/v1/owner/identities/[identity_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unsupported methods", async () => {
    const result: any = await handler({ method: "POST" }, null, makeCtx());
    expect(result.status).toBe(405);
  });

  it("returns 404 when identity missing", async () => {
    getMock.mockResolvedValue(null as any);
    const result: any = await handler({ method: "GET", query: { identity_id: identityId } }, null, makeCtx());
    expect(result.status).toBe(404);
  });

  it("returns identity on GET", async () => {
    getMock.mockResolvedValue({
      channel_identity_id: identityId,
      channel_type: "telegram",
      state: "ACTIVE",
      created_at: "2026-02-01T00:00:00Z"
    } as any);
    const result: any = await handler({ method: "GET", query: { identity_id: identityId } }, null, makeCtx());
    expect(result.status).toBe(200);
    expect(result.body.data.identity_id).toBe(identityId);
    expect(result.body.data.channel_type).toBe("telegram");
  });

  it("requires Idempotency-Key on DELETE", async () => {
    const result: any = await handler(
      { method: "DELETE", query: { identity_id: identityId }, headers: {} },
      null,
      makeCtx()
    );
    expect(result.status).toBe(400);
  });

  it("deletes identity", async () => {
    getMock.mockResolvedValue({
      channel_identity_id: identityId,
      channel_type: "telegram",
      state: "ACTIVE",
      created_at: "2026-02-01T00:00:00Z"
    } as any);
    revokeMock.mockResolvedValue({
      channel_identity_id: identityId,
      channel_type: "telegram",
      state: "REVOKED",
      revoked_at: "2026-02-11T00:00:00Z",
      created_at: "2026-02-01T00:00:00Z"
    } as any);
    const result: any = await handler(
      { method: "DELETE", query: { identity_id: identityId }, headers: { "idempotency-key": "idemp-1" } },
      null,
      makeCtx()
    );
    expect(result.status).toBe(200);
    expect(result.body.data.identity_id).toBe(identityId);
    expect(revokePairing).toHaveBeenCalled();
  });

  it("does not emit unlink audit event when identity is missing", async () => {
    getMock.mockResolvedValue(null as any);
    const ctx = makeCtx();
    const result: any = await handler(
      { method: "DELETE", query: { identity_id: identityId }, headers: { "idempotency-key": "idemp-2" } },
      null,
      ctx
    );
    expect(result.status).toBe(404);
    expect(ctx.auditEvent).toBeUndefined();
  });

  it("emits unlink audit event on successful revoke", async () => {
    getMock.mockResolvedValue({
      channel_identity_id: identityId,
      channel_type: "telegram",
      state: "ACTIVE",
      created_at: "2026-02-01T00:00:00Z"
    } as any);
    revokeMock.mockResolvedValue({
      channel_identity_id: identityId,
      channel_type: "telegram",
      state: "REVOKED",
      revoked_at: "2026-02-11T00:00:00Z",
      created_at: "2026-02-01T00:00:00Z"
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(
      { method: "DELETE", query: { identity_id: identityId }, headers: { "idempotency-key": "idemp-3" } },
      null,
      ctx
    );
    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("owner.identity_unlinked");
    expect(ctx.auditEntityType).toBe("channel_identity");
    expect(ctx.auditEntityId).toBe(identityId);
  });
});
