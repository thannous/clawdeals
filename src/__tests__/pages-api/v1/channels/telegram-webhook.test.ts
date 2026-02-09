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
  startPairing: vi.fn(),
  findActiveIdentity: vi.fn(),
  touchLastSeen: vi.fn(),
  revokePairing: vi.fn(),
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

import { handler } from "../../../../pages/api/v1/channels/telegram/webhook";
import { safeAuditLog } from "../../../../server/audit/singleton";
import { rateLimitMiddleware } from "../../../../server/rate-limit/middleware";
import {
  startPairing,
  findActiveIdentity,
  touchLastSeen
} from "../../../../server/services/channel-identities";
import { listApprovals, getApprovalForOwner, resolveApproval } from "../../../../server/services/approvals";
import { createConfirmation, consumeConfirmation } from "../../../../server/channels/command-confirmations";

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
    vi.mocked(findActiveIdentity).mockResolvedValue(null as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("status"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(result.body.text).toMatch(/not allowlisted/i);
    expect(result.body.text).toMatch(/\bconnect\b/i);
    expect(result.body.text).toMatch(/\bpair\b/i);
    expect(ctx.auditEvent).toBe("webhook.rejected");
    expect(ctx.security?.webhook_reject_reason).toBe("unpaired");
    expect(ctx.outcome?.type).toBe("BLOCKED");
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "command.blocked_not_allowlisted" })
    }));
  });

  it("pair returns a code and emits pairing.started", async () => {
    vi.mocked(startPairing).mockResolvedValue({
      identity: { channel_identity_id: "cid-1", state: "PENDING" },
      code: "CD-AAAAAA",
      expiresAt: new Date("2026-02-09T12:00:00Z"),
      alreadyActive: false
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("pair"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.text).toMatch(/CD-AAAAAA/);
    expect(safeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ event: "pairing.started" })
    }));
  });

  it("connect is an alias for pair", async () => {
    vi.mocked(startPairing).mockResolvedValue({
      identity: { channel_identity_id: "cid-1", state: "PENDING" },
      code: "CD-BBBBBB",
      expiresAt: new Date("2026-02-09T12:00:00Z"),
      alreadyActive: false
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(makeReq("connect"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.text).toMatch(/CD-BBBBBB/);
  });

  it("/start applies the channels.telegram.start rate limit group", async () => {
    const ctx = makeCtx();
    const result: any = await handler(makeReq("/start"), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.method).toBe("sendMessage");
    expect(vi.mocked(rateLimitMiddleware).mock.calls.some(([, opts]) => opts.routeGroup === "channels.telegram.start")).toBe(true);
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
    vi.mocked(findActiveIdentity).mockResolvedValue({
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

  it("approver approve flow requires confirm and confirm resolves", async () => {
    vi.mocked(findActiveIdentity).mockResolvedValue({
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
