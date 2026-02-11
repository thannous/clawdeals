import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/owners", () => ({
  getOwner: vi.fn()
}));

vi.mock("../../../../server/services/channel-identities", () => ({
  listChannelIdentities: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/owner/identities/index";
import { getOwner } from "../../../../server/services/owners";
import { listChannelIdentities } from "../../../../server/services/channel-identities";

const ownerId = "11111111-1111-4111-8111-111111111111";

const getOwnerMock = vi.mocked(getOwner);
const listMock = vi.mocked(listChannelIdentities);

function makeCtx(overrides: any = {}) {
  return { authError: null, ownerId, actor: { type: "owner", id: ownerId }, ...overrides } as any;
}

describe("/v1/owner/identities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unsupported methods", async () => {
    const result: any = await handler({ method: "PUT" }, null, makeCtx());
    expect(result.status).toBe(405);
  });

  it("requires owner auth", async () => {
    const result: any = await handler({ method: "GET" }, null, makeCtx({ ownerId: null, actor: null }));
    expect(result.status).toBe(401);
  });

  it("lists identities", async () => {
    getOwnerMock.mockResolvedValue({
      owner_id: ownerId,
      email: "test@example.com",
      email_verified_at: null
    } as any);
    listMock.mockResolvedValue([
      {
        channel_identity_id: "22222222-2222-4222-8222-222222222222",
        channel_type: "telegram",
        display_name: "@claw",
        role: "owner",
        state: "ACTIVE",
        created_at: "2026-02-01T00:00:00Z",
        approved_at: "2026-02-01T00:00:00Z",
        revoked_at: null,
        last_seen_at: null
      }
    ] as any);

    const result: any = await handler({ method: "GET", query: {} }, null, makeCtx());
    expect(result.status).toBe(200);
    expect(result.body.data.owner_id).toBe(ownerId);
    expect(result.body.data.email_masked).toBe("t***@example.com");
    expect(result.body.data.channels).toHaveLength(1);
    expect(result.body.data.channels[0].identity_id).toBe("22222222-2222-4222-8222-222222222222");
  });
});
