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
});
