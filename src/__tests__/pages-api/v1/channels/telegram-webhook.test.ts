import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/utils/channel-fingerprint", () => ({
  createChannelFingerprints: vi.fn(() => ({
    channel_user_id_hash: "hash-user",
    channel_context_id_hash: "hash-context"
  }))
}));

const mockRedis = {
  set: vi.fn()
};

vi.mock("../../../../server/redis/upstash", () => ({
  getRedis: () => mockRedis
}));

vi.mock("../../../../server/rate-limit/middleware", () => ({
  rateLimitMiddleware: vi.fn(async (_req: any, options: any) => ({
    status: 200,
    headers: null,
    body: null,
    meta: {
      group: options.routeGroup,
      scope: "channel",
      identity: options.channelId || "test"
    }
  }))
}));

vi.mock("../../../../server/audit/singleton", () => ({
  safeAuditLog: vi.fn(async () => {})
}));

vi.mock("../../../../server/services/channel-identities", () => ({
  findActiveIdentityByChannel: vi.fn(),
  findPendingIdentityByChannel: vi.fn(),
  touchLastSeen: vi.fn(),
  revokePairing: vi.fn(),
}));

vi.mock("../../../../server/services/pairing-tokens", () => ({
  createPairToken: vi.fn(),
  consumePairToken: vi.fn()
}));

vi.mock("../../../../server/services/channel-pairing", () => ({
  pairChannelIdentityForOwner: vi.fn()
}));

vi.mock("../../../../server/services/notification-preferences", () => ({
  NOTIFICATION_EVENT_TYPES: ["watchlist_match", "offer_received", "approval_required", "transaction_updates"],
  getOrCreateNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn()
}));

vi.mock("../../../../server/channels/telegram/client", () => ({
  sendTelegramMessage: vi.fn(async () => ({ ok: true }))
}));

vi.mock("../../../../server/services/approvals", () => ({
  listApprovals: vi.fn(),
  getApprovalForOwner: vi.fn(),
  resolveApproval: vi.fn()
}));

vi.mock("../../../../server/services/policies", () => ({
  getPolicyOrDefault: vi.fn()
}));

vi.mock("../../../../server/channels/command-confirmations", () => ({
  createConfirmation: vi.fn(async () => ({ ok: true })),
  consumeConfirmation: vi.fn(async () => ({ approvalId: "x" }))
}));

vi.mock("../../../../server/config/listing-media", () => ({
  getListingPhotosBucket: vi.fn(() => "listing-photos"),
  getMaxPhotoBytes: vi.fn(() => 8 * 1024 * 1024),
  getMaxPhotosPerListing: vi.fn(() => 8)
}));

vi.mock("../../../../server/services/listing-drafts", () => ({
  ensureActiveListingDraftForChannel: vi.fn(),
  appendDraftListingPhoto: vi.fn(),
  setDraftListingGeo: vi.fn()
}));

vi.mock("../../../../server/services/listing-media-storage", () => ({
  uploadListingPhoto: vi.fn()
}));

vi.mock("../../../../server/channels/telegram/media", () => ({
  getTelegramFileInfo: vi.fn(),
  downloadTelegramFileBytes: vi.fn(),
  sniffImageMime: vi.fn(),
  stripJpegExif: vi.fn((b: any) => b)
}));

import { handler } from "../../../../pages/api/v1/channels/telegram/webhook";
import { safeAuditLog } from "../../../../server/audit/singleton";
import { rateLimitMiddleware } from "../../../../server/rate-limit/middleware";
import {
  findActiveIdentityByChannel,
  findPendingIdentityByChannel,
  touchLastSeen
} from "../../../../server/services/channel-identities";
import { createPairToken, consumePairToken } from "../../../../server/services/pairing-tokens";
import { pairChannelIdentityForOwner } from "../../../../server/services/channel-pairing";
import { getOrCreateNotificationPreferences, updateNotificationPreferences } from "../../../../server/services/notification-preferences";
import { sendTelegramMessage } from "../../../../server/channels/telegram/client";
import { listApprovals, getApprovalForOwner, resolveApproval } from "../../../../server/services/approvals";
import { createConfirmation, consumeConfirmation } from "../../../../server/channels/command-confirmations";
import {
  ensureActiveListingDraftForChannel,
  appendDraftListingPhoto,
  setDraftListingGeo
} from "../../../../server/services/listing-drafts";
import { uploadListingPhoto } from "../../../../server/services/listing-media-storage";
import { getTelegramFileInfo, downloadTelegramFileBytes, sniffImageMime } from "../../../../server/channels/telegram/media";

const APPROVAL_ID = "00000000-0000-4000-a000-000000000123";

function makeCtx() {
  return {
    authError: null,
    ip: "127.0.0.1",
    requestId: "req-1",
    userAgent: "ua",
    method: "POST",
    path: "/api/v1/channels/telegram/webhook",
    query: {},
    actor: { type: "anonymous", id: null },
    agentId: null,
    ownerId: null,
    apiKeyId: null,
    apiKeyState: null,
    security: null,
    policy: null,
    idempotency: null,
    rateLimit: null,
    auditEvent: null,
    outcome: null
  };
}

let nextUpdateId = 1;
let nextMessageId = 1;

function makeReq(text: string, overrides: any = {}) {
  const updateId = overrides.update_id ?? nextUpdateId++;
  const messageId = overrides.message_id ?? nextMessageId++;
  return {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secret", ...(overrides.headers || {}) },
    query: overrides.query,
    body: {
      update_id: updateId,
      message: {
        message_id: messageId,
        text,
        from: { id: 123, username: "alice" },
        chat: { id: 456, type: overrides.chat_type || "private" }
      }
    }
  };
}

function makeCallbackReq(data: string, overrides: any = {}) {
  const updateId = overrides.update_id ?? nextUpdateId++;
  const messageId = overrides.message_id ?? nextMessageId++;
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secret", ...(overrides.headers || {}) },
    query: overrides.query,
    body: {
      update_id: updateId,
      callback_query: {
        id: overrides.callback_query_id || `cb-${updateId}`,
        from: { id: 123, username: "alice" },
        data,
        message: {
          message_id: messageId,
          date: overrides.date_seconds ?? nowSec,
          chat: { id: 456, type: "private" }
        }
      }
    }
  };
}

function makeReqLocation({ lat, lng, overrides }: any) {
  const updateId = overrides?.update_id ?? nextUpdateId++;
  const messageId = overrides?.message_id ?? nextMessageId++;
  return {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secret", ...(overrides?.headers || {}) },
    query: overrides?.query,
    body: {
      update_id: updateId,
      message: {
        message_id: messageId,
        from: { id: 123, username: "alice" },
        chat: { id: 456, type: overrides?.chat_type || "private" },
        location: { latitude: lat, longitude: lng }
      }
    }
  };
}

function makeReqPhoto({ overrides }: any = {}) {
  const updateId = overrides?.update_id ?? nextUpdateId++;
  const messageId = overrides?.message_id ?? nextMessageId++;
  return {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "secret", ...(overrides?.headers || {}) },
    query: overrides?.query,
    body: {
      update_id: updateId,
      message: {
        message_id: messageId,
        from: { id: 123, username: "alice" },
        chat: { id: 456, type: overrides?.chat_type || "private" },
        photo: [
          { file_id: "f1", width: 90, height: 90, file_size: 1000 },
          { file_id: "f2", width: 800, height: 600, file_size: 2000 }
        ]
      }
    }
  };
}

describe("POST /api/v1/channels/telegram/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextUpdateId = 1;
    nextMessageId = 1;
    process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN = "secret";
    process.env.AUDIT_HMAC_SECRET = "unit-test-secret";
    delete process.env.TELEGRAM_WEBHOOK_PATH_SECRET;

    const seenKeys = new Set<string>();
    mockRedis.set.mockImplementation(async (key: string) => {
      if (seenKeys.has(key)) return null;
      seenKeys.add(key);
      return "OK";
    });

    process.env.TELEGRAM_BOT_TOKEN = "token";
  });

  it("rejects missing or invalid secret token header", async () => {
    const ctx = makeCtx();
    const result: any = await handler(
      makeReq("help", {
        headers: { "x-telegram-bot-api-secret-token": undefined }
      }),
      null,
      ctx
    );

    expect(result.status).toBe(401);
    expect(result.body?.error?.code).toBe("UNAUTHORIZED");
    expect(ctx.auditEvent).toBe("webhook.rejected");
    expect(ctx.security?.webhook_reject_reason).toBe("secret_token_invalid");
  });

  it("enforces secret path when TELEGRAM_WEBHOOK_PATH_SECRET is configured", async () => {
    process.env.TELEGRAM_WEBHOOK_PATH_SECRET = "path-secret";

    const baseCtx = makeCtx();
    const baseRes: any = await handler(makeReq("help"), null, baseCtx);
    expect(baseRes.status).toBe(404);

    const wrongCtx = makeCtx();
    const wrongRes: any = await handler(makeReq("help", { query: { secret: "nope" } }), null, wrongCtx);
    expect(wrongRes.status).toBe(404);

    const okCtx = makeCtx();
    const okRes: any = await handler(makeReq("help", { query: { secret: "path-secret" } }), null, okCtx);
    expect(okRes.status).toBe(200);
    expect(okRes.body.method).toBe("sendMessage");
  });

  it("blocks when not allowlisted (suggests connect)", async () => {
    vi.mocked(findActiveIdentityByChannel).mockResolvedValue(null as any);
    vi.mocked(findPendingIdentityByChannel).mockResolvedValue(null as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("status"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(result.body.text).toMatch(/CHANNEL_NOT_PAIRED/);
    expect(result.body.text).toMatch(/\bconnect\b/i);
    expect(result.body.text).toMatch(/\bpair\b/i);
    expect(ctx.auditEvent).toBe("webhook.rejected");
    expect(ctx.security?.webhook_reject_reason).toBe("CHANNEL_NOT_PAIRED");
    expect(ctx.outcome?.type).toBe("BLOCKED");
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "command.blocked_not_paired" })
    }));
  });

  it("connect returns a web link + button and emits channel.pair_started", async () => {
    vi.mocked(createPairToken).mockResolvedValue({
      pair_token: "tok-1",
      expires_at: "2026-02-09T12:00:00Z",
      token_type: "CHANNEL_TO_WEB"
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("connect"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.text).toMatch(/\/pair\?token=tok-1/);
    expect(result.body.reply_markup).toBeTruthy();
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "channel.pair_started" })
    }));
  });

  it("pair is an alias for connect", async () => {
    vi.mocked(createPairToken).mockResolvedValue({
      pair_token: "tok-2",
      expires_at: "2026-02-09T12:00:00Z",
      token_type: "CHANNEL_TO_WEB"
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("pair"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.text).toMatch(/\/pair\?token=tok-2/);
  });

  it("location update stores geo on the active draft and emits location.received", async () => {
    vi.mocked(findActiveIdentityByChannel).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "owner",
      state: "ACTIVE"
    } as any);

    vi.mocked(ensureActiveListingDraftForChannel).mockResolvedValue({
      listingId: "l-1",
      listing: { listing_id: "l-1", title: "Untitled", photos: [] }
    } as any);

    vi.mocked(setDraftListingGeo).mockResolvedValue({
      listing: { listing_id: "l-1", title: "Untitled", photos: [] },
      photosCount: 0
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReqLocation({ lat: 48.8566, lng: 2.3522 }), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(result.body.text).toMatch(/Location: set/);
    expect(result.body.text).toMatch(/Status: DRAFT/);
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "location.received" })
    }));
  });

  it("photo update rejects when TELEGRAM_BOT_TOKEN is missing (media.rejected)", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "";

    vi.mocked(findActiveIdentityByChannel).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "owner",
      state: "ACTIVE"
    } as any);

    vi.mocked(ensureActiveListingDraftForChannel).mockResolvedValue({
      listingId: "l-1",
      listing: { listing_id: "l-1", title: "Untitled", photos: [] }
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReqPhoto(), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(result.body.text).toMatch(/TELEGRAM_BOT_TOKEN/i);
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "media.rejected" })
    }));

    expect(getTelegramFileInfo).not.toHaveBeenCalled();
    expect(downloadTelegramFileBytes).not.toHaveBeenCalled();
    expect(sniffImageMime).not.toHaveBeenCalled();
    expect(uploadListingPhoto).not.toHaveBeenCalled();
    expect(appendDraftListingPhoto).not.toHaveBeenCalled();
  });

  it("/start applies the channels.pair rate limit group", async () => {
    vi.mocked(consumePairToken).mockResolvedValue({ owner_id: "owner-1" } as any);
    vi.mocked(pairChannelIdentityForOwner).mockResolvedValue({
      identity: { channel_identity_id: "cid-1", owner_id: "owner-1", state: "ACTIVE" },
      state: "PAIRED"
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("/start"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(vi.mocked(rateLimitMiddleware).mock.calls.some(([, opts]) => opts.routeGroup === "channels.pair")).toBe(true);
  });

  it("blocks non-private chats (group spam guard)", async () => {
    const ctx = makeCtx();
    const result: any = await handler(makeReq("status", { chat_type: "group" }), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
    expect(ctx.auditEvent).toBe("webhook.rejected");
    expect(ctx.security?.webhook_reject_reason).toBe("group_chat");
  });

  it("dedupes replays (same message_id + chat_id)", async () => {
    const req = makeReq("help", { message_id: 999, update_id: 999 });

    const ctx1 = makeCtx();
    const first: any = await handler(req, null, ctx1);
    expect(first.status).toBe(200);
    expect(first.body.method).toBe("sendMessage");
    expect(ctx1.auditEvent).toBe("webhook.verified");

    const ctx2 = makeCtx();
    const second: any = await handler(req, null, ctx2);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ok: true, replay: true });
    expect(ctx2.auditEvent).toBe("webhook.replay_detected");
  });

  it("rejects too-old callback queries (TTL)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const ctx = makeCtx();
    const result: any = await handler(
      {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "secret" },
        body: {
          update_id: 1,
          callback_query: {
            id: "cbq-1",
            from: { id: 123, username: "alice" },
            data: "help",
            message: {
              message_id: 10,
              date: nowSec - 10_000,
              chat: { id: 456, type: "private" }
            }
          }
        }
      },
      null,
      ctx
    );

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("answerCallbackQuery");
    expect(result.body.text).toMatch(/Expired/);
    expect(ctx.auditEvent).toBe("webhook.rejected");
    expect(ctx.security?.webhook_reject_reason).toBe("callback_too_old");
  });

  it("answers callback queries when recent", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const ctx = makeCtx();
    const result: any = await handler(
      {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "secret" },
        body: {
          update_id: 1,
          callback_query: {
            id: "cbq-2",
            from: { id: 123, username: "alice" },
            data: "help",
            message: {
              message_id: 11,
              date: nowSec,
              chat: { id: 456, type: "private" }
            }
          }
        }
      },
      null,
      ctx
    );

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("answerCallbackQuery");
  });

  it("allowlisted viewer can run status", async () => {
    vi.mocked(findActiveIdentityByChannel).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "viewer",
      state: "ACTIVE"
    } as any);
    vi.mocked(touchLastSeen).mockResolvedValue(undefined as any);
    vi.mocked(listApprovals).mockResolvedValue({ approvals: [], nextCursor: null } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("status"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.text).toMatch(/CLAWDEALS status/);
    expect(ctx.ownerId).toBe("owner-1");
    expect(ctx.actor).toEqual({ type: "owner", id: "owner-1" });
  });

  it("notif returns a settings menu with reply_markup", async () => {
    vi.mocked(findActiveIdentityByChannel).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "viewer",
      state: "ACTIVE"
    } as any);
    vi.mocked(touchLastSeen).mockResolvedValue(undefined as any);

    vi.mocked(getOrCreateNotificationPreferences).mockResolvedValue({
      owner_id: "owner-1",
      mode: "DIGEST_HOURLY",
      timezone: "UTC",
      quiet_enabled: false,
      event_types: ["watchlist_match"],
      filters: {}
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("notif"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(result.body.reply_markup).toBeTruthy();
    expect(result.body.text).toMatch(/Notifications settings/);
  });

  it("notif callbacks send an outbound message and return answerCallbackQuery", async () => {
    vi.mocked(findActiveIdentityByChannel).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "viewer",
      state: "ACTIVE"
    } as any);
    vi.mocked(touchLastSeen).mockResolvedValue(undefined as any);

    vi.mocked(getOrCreateNotificationPreferences).mockResolvedValue({
      owner_id: "owner-1",
      mode: "DIGEST_HOURLY",
      timezone: "UTC",
      quiet_enabled: false,
      event_types: ["watchlist_match"],
      filters: {}
    } as any);

    vi.mocked(updateNotificationPreferences).mockResolvedValue({
      owner_id: "owner-1",
      mode: "SILENT",
      timezone: "UTC",
      quiet_enabled: false,
      event_types: ["watchlist_match"],
      filters: {}
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeCallbackReq("notif mode silent"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("answerCallbackQuery");
    expect(vi.mocked(sendTelegramMessage)).toHaveBeenCalledWith(expect.objectContaining({ chatId: "456" }));
  });

  it("approver approve flow requires confirm and confirm resolves", async () => {
    vi.mocked(findActiveIdentityByChannel).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "approver",
      state: "ACTIVE"
    } as any);
    vi.mocked(touchLastSeen).mockResolvedValue(undefined as any);

    vi.mocked(getApprovalForOwner).mockResolvedValue({
      approval_id: APPROVAL_ID,
      owner_id: "owner-1",
      state: "PENDING",
      action_type: "listing_publish",
      action_ref_id: "listing-1"
    } as any);

    vi.mocked(createConfirmation).mockResolvedValue({ ok: true } as any);

    const ctx1 = makeCtx();
    const step1: any = await handler(makeReq(`approve ${APPROVAL_ID}`), null, ctx1);
    expect(step1.status).toBe(200);
    expect(step1.body.text).toMatch(/Confirm with: approve/i);

    vi.mocked(consumeConfirmation).mockResolvedValue({ approvalId: APPROVAL_ID } as any);
    vi.mocked(resolveApproval).mockResolvedValue({ approval_id: APPROVAL_ID, state: "APPROVED" } as any);

    const ctx2 = makeCtx();
    const step2: any = await handler(makeReq(`approve ${APPROVAL_ID} confirm`), null, ctx2);
    expect(step2.status).toBe(200);
    expect(step2.body.text).toMatch(/Approved:/);
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "approval.resolved" })
    }));
  });
});
