import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../../server/services/pairing-tokens", () => ({
  createPairToken: vi.fn(),
  consumePairToken: vi.fn()
}));

vi.mock("../../../../server/services/channel-pairing", () => ({
  pairChannelIdentityForOwner: vi.fn()
}));

vi.mock("../../../../server/channels/telegram/client", () => ({
  sendTelegramMessage: vi.fn(async () => ({ ok: true }))
}));

vi.mock("../../../../server/utils/channel-fingerprint", () => ({
  createChannelFingerprints: vi.fn(() => ({
    channel_user_id_hash: "hash-user",
    channel_context_id_hash: "hash-context"
  }))
}));

import { handler } from "../../../../pages/api/v1/channels/telegram/[action]";
import { createPairToken, consumePairToken } from "../../../../server/services/pairing-tokens";
import { pairChannelIdentityForOwner } from "../../../../server/services/channel-pairing";
import { sendTelegramMessage } from "../../../../server/channels/telegram/client";

function makeCtx(ownerId = "00000000-0000-4000-a000-000000000123") {
  return {
    authError: null,
    actor: { type: "owner", id: ownerId },
    ownerId,
    security: null,
    auditEvent: null
  };
}

describe("v1 telegram pairing endpoints", () => {
  const prevEnv: any = {};

  beforeEach(() => {
    vi.clearAllMocks();
    prevEnv.TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;
  });

  afterEach(() => {
    process.env.TELEGRAM_BOT_USERNAME = prevEnv.TELEGRAM_BOT_USERNAME;
  });

	  it("pair:start fails when TELEGRAM_BOT_USERNAME is missing", async () => {
	    const prevNodeEnv = process.env.NODE_ENV;
	    (process.env as any).NODE_ENV = "production";
	    delete process.env.TELEGRAM_BOT_USERNAME;

    const ctx = makeCtx();
    const result: any = await handler(
      {
        method: "POST",
        query: { action: "pair:start" },
        body: {}
      },
      null,
      ctx
    );

	    expect(result.status).toBe(500);
	    expect(result.body.error.code).toBe("MISSING_TELEGRAM_BOT_USERNAME");
	    (process.env as any).NODE_ENV = prevNodeEnv;
	  });
});
