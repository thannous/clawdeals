import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/channel-identities", () => ({
  listChannelIdentities: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/channels";
import { listChannelIdentities } from "../../../../server/services/channel-identities";

const ownerId = "11111111-1111-4111-8111-111111111111";
const listMock = vi.mocked(listChannelIdentities);

function makeCtx(overrides: any = {}) {
  return {
    authError: null,
    ownerId,
    actor: { type: "owner", id: ownerId },
    ...overrides
  } as any;
}

describe("GET /v1/channels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires an owner actor even when an owner id is present", async () => {
    const result: any = await handler(
      { method: "GET", query: {} },
      null,
      makeCtx({ actor: { type: "agent", id: "agent-1" } })
    );

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(listMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ state: "unknown" }, "state is invalid"],
    [{ limit: "abc" }, "limit must be an integer"],
    [{ limit: "101" }, "limit must be between 1 and 100"]
  ])("rejects invalid filters %#", async (query, message) => {
    const result: any = await handler({ method: "GET", query }, null, makeCtx());

    expect(result.status).toBe(400);
    expect(result.body.error.message).toBe(message);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("normalizes filters and maps internal states without exposing identity internals", async () => {
    listMock.mockResolvedValue([
      {
        channel_identity_id: "22222222-2222-4222-8222-222222222222",
        owner_id: ownerId,
        channel_type: "telegram",
        channel_user_id: "sensitive-user-id",
        pairing_code_hash: "sensitive-hash",
        display_name: "Alice",
        role: "approver",
        state: "ACTIVE",
        created_at: "2026-07-23T09:00:00.000Z",
        approved_at: "2026-07-23T09:10:00.000Z"
      },
      {
        channel_identity_id: "33333333-3333-4333-8333-333333333333",
        channel_type: "discord",
        state: "PENDING"
      }
    ] as any);
    const ctx = makeCtx();

    const result: any = await handler(
      {
        method: "GET",
        query: {
          state: ["active", "ignored"],
          channel_type: ["telegram", "discord"],
          limit: ["25", "50"]
        }
      },
      null,
      ctx
    );

    expect(result.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith({
      ownerId,
      state: "ACTIVE",
      channelType: "telegram",
      limit: 25
    });
    expect(result.body.data.channels).toEqual([
      expect.objectContaining({
        channel_account_id: "22222222-2222-4222-8222-222222222222",
        state: "PAIRED",
        paired_at: "2026-07-23T09:10:00.000Z"
      }),
      expect.objectContaining({
        channel_account_id: "33333333-3333-4333-8333-333333333333",
        state: "PENDING_APPROVAL"
      })
    ]);
    expect(result.body.data.channels[0]).not.toHaveProperty("owner_id");
    expect(result.body.data.channels[0]).not.toHaveProperty("channel_user_id");
    expect(result.body.data.channels[0]).not.toHaveProperty("pairing_code_hash");
    expect(ctx.auditEvent).toBe("channels.listed");
  });
});
