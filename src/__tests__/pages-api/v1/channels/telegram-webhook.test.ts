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
  setDraftListingGeo: vi.fn(),
  removeDraftListingPhotoAt: vi.fn(),
  setDraftListingCoverImage: vi.fn()
}));

vi.mock("../../../../server/services/listing-media-storage", () => ({
  uploadListingPhoto: vi.fn(),
  deleteListingPhoto: vi.fn()
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
  setDraftListingGeo,
  removeDraftListingPhotoAt,
  setDraftListingCoverImage
} from "../../../../server/services/listing-drafts";
import { deleteListingPhoto, uploadListingPhoto } from "../../../../server/services/listing-media-storage";
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

  it("supports removing a draft photo via text command", async () => {
    vi.mocked(findActiveIdentityByChannel).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "owner",
      state: "ACTIVE"
    } as any);

    vi.mocked(ensureActiveListingDraftForChannel).mockResolvedValue({
      listingId: "l-1",
      listing: {
        listing_id: "l-1",
        title: "Untitled",
        photos: [{ storage_key: "k1", mime: "image/jpeg" }, { storage_key: "k2", mime: "image/jpeg" }],
        cover_image_index: 0
      }
    } as any);

    vi.mocked(removeDraftListingPhotoAt).mockResolvedValue({
      listing: { listing_id: "l-1", title: "Untitled", photos: [{ storage_key: "k1", mime: "image/jpeg" }] },
      photosCount: 1,
      coverImageIndex: 0
    } as any);

    const result: any = await handler(makeReq("photo remove 2"), null, makeCtx());
    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(result.body.text).toMatch(/Photos: 1\/8/);
    expect(result.body.text).toMatch(/Cover: #1/);
    expect(removeDraftListingPhotoAt).toHaveBeenCalledWith(expect.objectContaining({ index: 1 }));
  });

  it("supports setting draft cover via text command", async () => {
    vi.mocked(findActiveIdentityByChannel).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "owner",
      state: "ACTIVE"
    } as any);

    vi.mocked(ensureActiveListingDraftForChannel).mockResolvedValue({
      listingId: "l-1",
      listing: {
        listing_id: "l-1",
        title: "Untitled",
        photos: [{ storage_key: "k1", mime: "image/jpeg" }, { storage_key: "k2", mime: "image/jpeg" }],
        cover_image_index: 0
      }
    } as any);

    vi.mocked(setDraftListingCoverImage).mockResolvedValue({
      listing: { listing_id: "l-1", title: "Untitled", photos: [{ storage_key: "k1", mime: "image/jpeg" }, { storage_key: "k2", mime: "image/jpeg" }] },
      photosCount: 2,
      coverImageIndex: 1
    } as any);

    const result: any = await handler(makeReq("cover 2"), null, makeCtx());
    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(result.body.text).toMatch(/Photos: 2\/8/);
    expect(result.body.text).toMatch(/Cover: #2/);
    expect(setDraftListingCoverImage).toHaveBeenCalledWith(expect.objectContaining({ coverImageIndex: 1 }));
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

  it("photo update short-circuits when draft is already at max photos (no download/upload)", async () => {
    vi.mocked(findActiveIdentityByChannel).mockResolvedValue({
      channel_identity_id: "cid-1",
      owner_id: "owner-1",
      role: "owner",
      state: "ACTIVE"
    } as any);

    vi.mocked(ensureActiveListingDraftForChannel).mockResolvedValue({
      listingId: "l-1",
      listing: {
        listing_id: "l-1",
        title: "Untitled",
        photos: new Array(8).fill(null).map((_, i) => ({ storage_key: `k${i}`, mime: "image/jpeg" }))
      }
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReqPhoto(), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(result.body.text).toMatch(/photo limit exceeded/i);
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "media.rejected" })
    }));

    expect(getTelegramFileInfo).not.toHaveBeenCalled();
    expect(downloadTelegramFileBytes).not.toHaveBeenCalled();
    expect(sniffImageMime).not.toHaveBeenCalled();
    expect(uploadListingPhoto).not.toHaveBeenCalled();
    expect(appendDraftListingPhoto).not.toHaveBeenCalled();
    expect(deleteListingPhoto).not.toHaveBeenCalled();
  });

  it("cleans up uploaded storage objects when appendDraftListingPhoto fails", async () => {
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

    vi.mocked(getTelegramFileInfo).mockResolvedValue({ file_path: "p.jpg", file_size: 2000 } as any);
    vi.mocked(downloadTelegramFileBytes).mockResolvedValue(Buffer.from("jpeg") as any);
    vi.mocked(sniffImageMime).mockReturnValue("image/jpeg" as any);

    vi.mocked(uploadListingPhoto).mockResolvedValue({
      bucket: "listing-photos",
      storage_key: "listings/l-1/x.jpg",
      bytes: 4,
      mime: "image/jpeg"
    } as any);

    vi.mocked(appendDraftListingPhoto).mockRejectedValue(
      Object.assign(new Error("Photo limit exceeded"), { code: "PHOTO_LIMIT_EXCEEDED" })
    );

    vi.mocked(deleteListingPhoto).mockResolvedValue({ ok: true } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReqPhoto(), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(result.body.text).toMatch(/photo limit exceeded/i);
    expect(deleteListingPhoto).toHaveBeenCalledWith({ bucket: "listing-photos", storageKey: "listings/l-1/x.jpg" });
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

  it("returns 404 when channel commands are disabled in production", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.CHANNEL_COMMANDS_ENABLED;

      const ctx = makeCtx();
      const result: any = await handler(makeReq("help"), null, ctx);
      expect(result.status).toBe(404);
      expect(result.body.error.code).toBe("NOT_FOUND");
      expect(ctx.auditEvent).toBe("webhook.rejected");
      expect(ctx.security?.webhook_reject_reason).toBe("disabled");
    } finally {
      (process.env as any).NODE_ENV = prevNodeEnv;
    }
  });
});
