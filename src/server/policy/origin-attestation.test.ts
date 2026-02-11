import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/channel-identities", () => ({
  getChannelIdentity: vi.fn()
}));

import { getChannelIdentity } from "../services/channel-identities";
import { attestOriginContextForOwner } from "./origin-attestation";

const getChannelIdentityMock = vi.mocked(getChannelIdentity);

describe("attestOriginContextForOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelIdentityMock.mockResolvedValue(null as any);
  });

  it("allows CONTROL_DM without external attestation source", async () => {
    const result = await attestOriginContextForOwner({
      ownerId: "00000000-0000-4000-a000-000000000111",
      requestedOriginContext: { kind: "control_dm" }
    });

    expect(result.ok).toBe(true);
    expect((result as any).originContext.kind).toBe("CONTROL_DM");
    expect((result as any).attested).toBe(false);
  });

  it("rejects non-control origin without attestation", async () => {
    const result = await attestOriginContextForOwner({
      ownerId: "00000000-0000-4000-a000-000000000111",
      requestedOriginContext: { kind: "public_group" }
    });

    expect(result.ok).toBe(false);
    expect((result as any).code).toBe("ORIGIN_CONTEXT_UNATTESTED");
  });

  it("rejects when requested origin mismatches channel-identity attestation", async () => {
    getChannelIdentityMock.mockResolvedValue({
      channel_identity_id: "00000000-0000-4000-a000-000000000888",
      owner_id: "00000000-0000-4000-a000-000000000111",
      channel_type: "discord",
      channel_user_id: "user-1",
      channel_context_id: "group-1"
    } as any);

    const result = await attestOriginContextForOwner({
      ownerId: "00000000-0000-4000-a000-000000000111",
      requestedOriginContext: { kind: "control_dm" },
      channelIdentityId: "00000000-0000-4000-a000-000000000888"
    });

    expect(result.ok).toBe(false);
    expect((result as any).code).toBe("ORIGIN_CONTEXT_MISMATCH");
  });

  it("accepts channel-identity attested PUBLIC_GROUP origin", async () => {
    getChannelIdentityMock.mockResolvedValue({
      channel_identity_id: "00000000-0000-4000-a000-000000000888",
      owner_id: "00000000-0000-4000-a000-000000000111",
      channel_type: "discord",
      channel_user_id: "user-1",
      channel_context_id: "group-1"
    } as any);

    const result = await attestOriginContextForOwner({
      ownerId: "00000000-0000-4000-a000-000000000111",
      requestedOriginContext: { kind: "public_group" },
      channelIdentityId: "00000000-0000-4000-a000-000000000888"
    });

    expect(result.ok).toBe(true);
    expect((result as any).originContext.kind).toBe("PUBLIC_GROUP");
    expect((result as any).attested).toBe(true);
  });
});
