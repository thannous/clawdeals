import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createChannelFingerprints, createChannelUserIdHash } from "./channel-fingerprint";

describe("channel fingerprinting", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("requires AUDIT_HMAC_SECRET when secret is not provided", () => {
    expect(() =>
      createChannelUserIdHash({ channelType: "telegram", channelUserId: "user-1" })
    ).toThrow(/AUDIT_HMAC_SECRET/);
  });

  it("uses env AUDIT_HMAC_SECRET by default and returns stable hex digests", () => {
    process.env.AUDIT_HMAC_SECRET = "secret-1";

    const fp = createChannelFingerprints({
      channelType: "telegram",
      channelUserId: "user-1",
      channelContextId: "chat-1"
    });

    expect(fp.channel_user_id_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fp.channel_context_id_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(fp.channel_user_id_hash).not.toBe(fp.channel_context_id_hash);
  });

  it("normalizes undefined inputs to null for hashing", () => {
    const secret = "secret-1";
    const a = createChannelUserIdHash({ channelType: undefined, channelUserId: undefined, secret });
    const b = createChannelUserIdHash({ channelType: null, channelUserId: null, secret });
    expect(a).toBe(b);
  });
});

