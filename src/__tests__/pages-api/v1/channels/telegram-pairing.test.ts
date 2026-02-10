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

  it("pair:start returns token + deeplink", async () => {
    process.env.TELEGRAM_BOT_USERNAME = "clawdeals_bot";
    vi.mocked(createPairToken).mockResolvedValue({
      pair_token: "tok-1",
      expires_at: "2026-02-10T00:00:00Z",
      token_type: "WEB_TO_CHANNEL"
    } as any);

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

    expect(result.status).toBe(201);
    expect(result.body.data.pair_token).toBe("tok-1");
    expect(result.body.data.telegram_deeplink).toBe("https://t.me/clawdeals_bot?start=tok-1");
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

  it("pair:confirm consumes token, pairs identity, and notifies telegram (best effort)", async () => {
    vi.mocked(consumePairToken).mockResolvedValue({
      token_type: "CHANNEL_TO_WEB",
      channel_type: "telegram",
      channel_user_id: "123",
      channel_context_id: "456",
      display_name: "alice",
      owner_id: null
    } as any);

    vi.mocked(pairChannelIdentityForOwner).mockResolvedValue({
      identity: {
        channel_identity_id: "cid-1",
        channel_type: "telegram",
        display_name: "alice",
        role: "owner",
        state: "ACTIVE"
      },
      state: "PAIRED"
    } as any);

    vi.mocked(sendTelegramMessage).mockResolvedValue({ ok: true } as any);

    const ctx = makeCtx();
    const result: any = await handler(
      {
        method: "POST",
        query: { action: "pair:confirm" },
        body: { pair_token: "tok-2" }
      },
      null,
      ctx
    );

    expect(result.status).toBe(200);
    expect(result.body.data.state).toBe("PAIRED");
    expect(result.body.data.telegram_notified).toBe(true);
    expect(result.body.data.channel.channel_account_id).toBe("cid-1");
    expect(vi.mocked(sendTelegramMessage)).toHaveBeenCalledWith(expect.objectContaining({ chatId: "456" }));
  });

  it("pair:confirm maps token errors", async () => {
    vi.mocked(consumePairToken).mockRejectedValue(Object.assign(new Error("expired"), { status: 400, code: "PAIR_TOKEN_EXPIRED" }));

    const ctx = makeCtx();
    const result: any = await handler(
      {
        method: "POST",
        query: { action: "pair:confirm" },
        body: { pair_token: "tok-x" }
      },
      null,
      ctx
    );

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("PAIR_TOKEN_EXPIRED");
  });
});
