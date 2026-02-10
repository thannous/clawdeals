import crypto from "node:crypto";

import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { errorPayload } from "../../../../../../server/http/errors";
import { rateLimitMiddleware } from "../../../../../../server/rate-limit/middleware";
import { getNumberEnv } from "../../../../../../server/config/env";
import { safeAuditLog } from "../../../../../../server/audit/singleton";
import { createChannelFingerprints } from "../../../../../../server/utils/channel-fingerprint";
import { parseCommand } from "../../../../../../server/channels/commands/parser";
import { executeChannelCommand } from "../../../../../../server/channels/commands/execute";
import {
  buildTelegramAnswerCallbackQuery,
  buildTelegramSendMessage
} from "../../../../../../server/channels/commands/format";
import {
  getTelegramWebhookDedupeTtlSeconds,
  markTelegramWebhookSeen
} from "../../../../../../server/channels/telegram/webhook-dedupe";

const DEFAULT_CALLBACK_MAX_AGE_SECONDS = 600;

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  const str = String(value);
  return str ? str : null;
}

function safeNumber(value: any) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function redactWebhookSecretInCtx(ctx: any) {
  if (!ctx) return;
  // Do not leak webhook secrets (path param) in audit logs.
  if (typeof ctx.path === "string" && ctx.path.startsWith("/api/v1/channels/telegram/webhook/")) {
    ctx.path = "/api/v1/channels/telegram/webhook";
  }

  // Next.js dynamic route params live in req.query (and thus ctx.query).
  if (ctx.query && typeof ctx.query === "object" && "secret" in ctx.query) {
    const next = { ...(ctx.query as any) };
    delete (next as any).secret;
    ctx.query = next;
  }
}

function readHeader(headers: any, name: string) {
  if (!headers) return null;
  const direct = headers[name];
  if (Array.isArray(direct)) return direct[0] || null;
  if (direct) return direct;
  const lower = headers[String(name).toLowerCase()];
  if (Array.isArray(lower)) return lower[0] || null;
  return lower || null;
}

function timingSafeEquals(a: string, b: string) {
  // timingSafeEqual throws on length mismatch.
  const aa = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function isEnabledFlag(value: any) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function respondNotFound() {
  return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
}

function setWebhookVerified(ctx: any) {
  if (!ctx) return;
  ctx.auditEvent = "webhook.verified";
}

function setWebhookRejected(ctx: any, reason: string) {
  if (!ctx) return;
  ctx.auditEvent = "webhook.rejected";
  ctx.outcome = { type: "BLOCKED", reason };
  ctx.security = {
    ...(ctx.security || {}),
    webhook_reject_reason: reason
  };
}

function setWebhookReplayDetected(ctx: any) {
  if (!ctx) return;
  ctx.auditEvent = "webhook.replay_detected";
  ctx.outcome = { type: "BLOCKED", reason: "replay" };
  ctx.security = {
    ...(ctx.security || {}),
    webhook_reject_reason: "replay"
  };
}

function buildAuditEventFromCtx(ctx: any, eventName: string, payload: any, outcome = "SUCCESS") {
  return {
    occurredAt: new Date().toISOString(),
    actor: ctx?.actor || null,
    auth: {
      agent_id: ctx?.agentId || null,
      owner_id: ctx?.ownerId || null,
      api_key_id: ctx?.apiKeyId || null,
      api_key_state: ctx?.apiKeyState || null
    },
    request: {
      id: ctx?.requestId || null,
      ip: ctx?.ip || null,
      userAgent: ctx?.userAgent || null,
      method: ctx?.method || null,
      path: ctx?.path || null,
      query: ctx?.query || null
    },
    action: {
      route_group: ctx?.rateLimit?.group || null,
      method: ctx?.method || null,
      path: ctx?.path || null,
      event: eventName
    },
    security: ctx?.security || {},
    policy: ctx?.policy || {},
    payload: payload || {},
    rateLimit: ctx?.rateLimit || null,
    idempotency: ctx?.idempotency || null,
    outcome
  };
}

async function applyChannelRateLimit({ req, ctx, group, channelId, callbackQueryId }: any) {
  const result: any = await rateLimitMiddleware(req, {
    routeGroup: group,
    channelId,
    ip: ctx?.ip || null,
    env: process.env,
    onRateLimited: (meta: any) => {
      if (!ctx) return;
      ctx.rateLimit = {
        group: meta.group,
        scope: meta.scope,
        identity: meta.identity,
        limit: meta.limit,
        windowSeconds: meta.windowSeconds,
        retryAfterSeconds: meta.retryAfterSeconds,
        remaining: meta.remaining,
        resetSeconds: meta.resetSeconds
      };
    }
  });

  if (!result) return null;

  if (result.status === 429) {
    if (ctx) {
      ctx.outcome = { type: "BLOCKED", reason: "rate_limit" };
      ctx.security = {
        ...(ctx.security || {}),
        webhook_rate_limit_group: group
      };
      setWebhookRejected(ctx, "rate_limit");
    }

    // Telegram expects 200 and may retry aggressively on non-200 responses.
    if (callbackQueryId) {
      return jsonResponse(200, buildTelegramAnswerCallbackQuery({ callbackQueryId, text: "Rate limited" }));
    }

    return jsonResponse(200, { ok: true, rate_limited: true });
  }

  if (result.meta && ctx) {
    ctx.rateLimit = {
      group: result.meta.group || group,
      scope: result.meta.scope,
      identity: result.meta.identity
    };
  }

  return null;
}

function resolveTelegramMessage(update: any) {
  if (!update || typeof update !== "object") return null;
  return update.message || update.edited_message || null;
}

function resolveTelegramCallbackQuery(update: any) {
  if (!update || typeof update !== "object") return null;
  return update.callback_query || null;
}

function resolveTelegramDisplayName(from: any) {
  if (!from || typeof from !== "object") return null;
  const username = typeof from.username === "string" && from.username.trim() ? from.username.trim() : null;
  if (username) return username;
  const first = typeof from.first_name === "string" ? from.first_name.trim() : "";
  const last = typeof from.last_name === "string" ? from.last_name.trim() : "";
  const full = `${first} ${last}`.trim();
  return full || null;
}

function truncateTelegramCallbackText(text: string, maxLen = 180) {
  if (!text) return "";
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 3))}...`;
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const expectedPathSecret = process.env.TELEGRAM_WEBHOOK_PATH_SECRET || null;
  const providedPathSecret = resolveParam(req.query?.secret);
  if (ctx) {
    redactWebhookSecretInCtx(ctx);
    // Always keep audit payload safe: do not store raw Telegram bodies (PII risk).
    const callback = resolveTelegramCallbackQuery(req.body);
    const message = callback ? null : resolveTelegramMessage(req.body);
    const chat = callback?.message?.chat || message?.chat || null;
    const chatType = typeof chat?.type === "string" ? chat.type : null;
    const callbackQueryId = callback?.id != null ? String(callback.id) : null;
    const messageId =
      callback?.message?.message_id != null
        ? String(callback.message.message_id)
        : message?.message_id != null
          ? String(message.message_id)
          : null;
    const rawText = typeof message?.text === "string" ? message.text : "";
    const rawData = typeof callback?.data === "string" ? callback.data : "";

    ctx.origin = "channel:telegram";
    ctx.body = {
      telegram: {
        update_id: safeNumber(req.body?.update_id),
        callback_query_id: callbackQueryId,
        message_id: messageId,
        chat_type: chatType,
        text_len: callback ? 0 : rawText.length,
        data_len: callback ? rawData.length : 0
      }
    };
    ctx.security = {
      ...(ctx.security || {}),
      origin: "channel:telegram",
      webhook_path_secret_present: Boolean(providedPathSecret),
      webhook_secret_token_present: Boolean(readHeader(req.headers, "x-telegram-bot-api-secret-token"))
    };
  }

  if (process.env.NODE_ENV === "production" && !isEnabledFlag(process.env.CHANNEL_COMMANDS_ENABLED)) {
    if (ctx) {
      setWebhookRejected(ctx, "disabled");
    }
    return respondNotFound();
  }

  if (ctx?.authError) {
    if (ctx) {
      setWebhookRejected(ctx, "auth_error");
    }
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (expectedPathSecret) {
    if (!providedPathSecret || !timingSafeEquals(providedPathSecret, expectedPathSecret)) {
      if (ctx) {
        setWebhookRejected(ctx, "path_secret_invalid");
      }
      return respondNotFound();
    }
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || null;
  const secretHeader = readHeader(req.headers, "x-telegram-bot-api-secret-token");
  const shouldEnforceSecret = process.env.NODE_ENV === "production" || Boolean(expectedSecret);
  if (shouldEnforceSecret) {
    if (!expectedSecret || !secretHeader || !timingSafeEquals(secretHeader, expectedSecret)) {
      if (ctx) {
        setWebhookRejected(ctx, "secret_token_invalid");
      }
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Invalid Telegram secret token"));
    }
  }

  const callback = resolveTelegramCallbackQuery(req.body);
  const message = callback ? null : resolveTelegramMessage(req.body);

  const from = callback?.from || message?.from || null;
  const chat = callback?.message?.chat || message?.chat || null;
  const channelUserId = from?.id != null ? String(from.id) : "";
  const chatId = chat?.id != null ? String(chat.id) : "";
  const callbackQueryId = callback?.id != null ? String(callback.id) : "";

  const messageId =
    callback?.message?.message_id != null
      ? String(callback.message.message_id)
      : message?.message_id != null
        ? String(message.message_id)
        : "";

  const chatType = typeof chat?.type === "string" ? chat.type : null;

  if (callback) {
    const maxAgeSeconds =
      getNumberEnv("TELEGRAM_WEBHOOK_CALLBACK_MAX_AGE_SECONDS", { defaultValue: DEFAULT_CALLBACK_MAX_AGE_SECONDS }) ??
      DEFAULT_CALLBACK_MAX_AGE_SECONDS;
    const messageDateSeconds = callback?.message?.date != null ? Number(callback.message.date) : NaN;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ageSeconds = Number.isFinite(messageDateSeconds) ? nowSeconds - messageDateSeconds : Infinity;

    if (!Number.isFinite(messageDateSeconds) || ageSeconds > maxAgeSeconds) {
      if (ctx) {
        ctx.body = {
          telegram: {
            update_id: req.body?.update_id ?? null,
            callback_query_id: callbackQueryId || null,
            message_id: messageId || null,
            chat_type: chatType,
            data_len: typeof callback?.data === "string" ? callback.data.length : 0
          }
        };
        ctx.origin = "channel:telegram";
        setWebhookRejected(ctx, "callback_too_old");
      }
      if (callbackQueryId) {
        return jsonResponse(200, buildTelegramAnswerCallbackQuery({ callbackQueryId, text: "Expired" }));
      }
      return jsonResponse(200, { ok: true });
    }
  }

  if (!channelUserId || !chatId) {
    return jsonResponse(200, { ok: true });
  }

  if (chatType !== "private") {
    if (ctx) {
      ctx.body = {
        telegram: {
          update_id: req.body?.update_id ?? null,
          callback_query_id: callbackQueryId || null,
          message_id: messageId || null,
          chat_type: chatType,
          text_len: typeof message?.text === "string" ? message.text.length : 0,
          data_len: typeof callback?.data === "string" ? callback.data.length : 0
        }
      };
      ctx.origin = "channel:telegram";
      setWebhookRejected(ctx, "group_chat");
    }
    if (callbackQueryId) {
      return jsonResponse(200, buildTelegramAnswerCallbackQuery({ callbackQueryId, text: "DM only" }));
    }
    return jsonResponse(200, { ok: true });
  }

  const rawText = typeof message?.text === "string" ? message.text : "";
  const rawData = typeof callback?.data === "string" ? callback.data : "";
  const rawCommand = callback ? rawData : rawText;

  if (!rawCommand) {
    // Non-text updates are ignored (ACK).
    return jsonResponse(200, { ok: true });
  }

  const channelType = "telegram";
  const channelContextId = chatId;
  const displayName = resolveTelegramDisplayName(from);
  const command = parseCommand(rawCommand);

  const hashes = createChannelFingerprints({
    channelType,
    channelUserId,
    channelContextId
  });

  const channelRateLimitId = `telegram:${hashes.channel_user_id_hash}`;

  if (ctx) {
    // Avoid storing Telegram PII (raw ids, usernames, message text) in audit payloads.
    ctx.body = {
      telegram: {
        update_id: req.body?.update_id ?? null,
        callback_query_id: callbackQueryId || null,
        message_id: messageId || null,
        chat_type: chatType,
        text_len: callback ? 0 : rawText.length,
        data_len: callback ? rawData.length : 0
      }
    };
    ctx.origin = "channel:telegram";
    ctx.security = {
      ...(ctx.security || {}),
      origin: "channel:telegram",
      channel_type: channelType,
      channel_user_id_hash: hashes.channel_user_id_hash,
      channel_context_id_hash: hashes.channel_context_id_hash,
      command: command.kind
    };
  }

  // Anti-replay (Redis dedupe). Must run before rate limits to avoid consuming buckets for replays.
  try {
    const ttlSeconds = getTelegramWebhookDedupeTtlSeconds();
    const dedupeData = callback
      ? { kind: "callback_query", callback_query_id: callbackQueryId || null }
      : { kind: "message", chat_id: chatId, message_id: messageId || null };

    const seen = await markTelegramWebhookSeen({ data: dedupeData, ttlSeconds });
    if (!seen.ok) {
      if (ctx) {
        setWebhookReplayDetected(ctx);
      }
      if (callbackQueryId) {
        return jsonResponse(200, buildTelegramAnswerCallbackQuery({ callbackQueryId, text: "Already handled" }));
      }
      return jsonResponse(200, { ok: true, replay: true });
    }
  } catch (error) {
    // In production, fail closed to avoid processing unaudited replays.
    if (process.env.NODE_ENV === "production") {
      if (ctx) {
        setWebhookRejected(ctx, "dedupe_unavailable");
      }
      if (callbackQueryId) {
        return jsonResponse(200, buildTelegramAnswerCallbackQuery({ callbackQueryId, text: "Temporary error" }));
      }
      return jsonResponse(200, { ok: true });
    }
  }

  if (ctx) {
    setWebhookVerified(ctx);
  }

  // Base rate limit (per channel user).
  const webhookRl = await applyChannelRateLimit({
    req,
    ctx,
    group: "channels.telegram.webhook",
    channelId: channelRateLimitId,
    callbackQueryId
  });
  if (webhookRl) return webhookRl;

  if (callback) {
    const callbackRl = await applyChannelRateLimit({
      req,
      ctx,
      group: "channels.telegram.callback",
      channelId: channelRateLimitId,
      callbackQueryId
    });
    if (callbackRl) return callbackRl;
  } else if (command.kind === "unknown") {
    const textRl = await applyChannelRateLimit({
      req,
      ctx,
      group: "channels.telegram.text",
      channelId: channelRateLimitId,
      callbackQueryId: null
    });
    if (textRl) return textRl;
  }

  // Pairing flows are more sensitive (abuse / brute force).
  if (command.kind === "connect" || command.kind === "start") {
    const pairRl = await applyChannelRateLimit({
      req,
      ctx,
      group: "channels.pair",
      channelId: channelRateLimitId,
      callbackQueryId
    });
    if (pairRl) return pairRl;
  }

  // Confirmation actions (approve/deny/unpair) get an extra bucket.
  const isConfirmAction =
    (command.kind === "approve" || command.kind === "deny" || command.kind === "unpair") && command.confirm === true;
  if (isConfirmAction) {
    const confirmRl = await applyChannelRateLimit({
      req,
      ctx,
      group: "channels.confirm",
      channelId: channelRateLimitId,
      callbackQueryId
    });
    if (confirmRl) return confirmRl;
  }

  let result: any;
  try {
    result = await executeChannelCommand({
      channel: {
        channelType,
        channelUserId,
        channelContextId,
        displayName
      },
      command,
      ctx
    });
  } catch (error: any) {
    if (ctx) {
      ctx.outcome = { type: "FAILURE", reason: "exception" };
    }
    const messageText = `Error: ${error?.message || "Unexpected error"}`;
    if (callbackQueryId) {
      return jsonResponse(200, buildTelegramAnswerCallbackQuery({ callbackQueryId, text: truncateTelegramCallbackText(messageText) }));
    }
    const responseBody = buildTelegramSendMessage({
      chatId,
      text: messageText,
      disableWebPagePreview: true
    });
    return jsonResponse(200, responseBody);
  }

  if (result?.identity?.channel_identity_id && ctx) {
    ctx.security = {
      ...(ctx.security || {}),
      channel_identity_id: result.identity.channel_identity_id
    };
  }

  if (result.blocked && ctx) {
    setWebhookRejected(ctx, "CHANNEL_NOT_PAIRED");
    await safeAuditLog(buildAuditEventFromCtx(ctx, "command.blocked_not_paired", { command: command.kind }, "BLOCKED"));
  }

  if (command.kind === "connect") {
    await safeAuditLog(
      buildAuditEventFromCtx(ctx, "channel.pair_started", {
        channel_type: channelType
      })
    );
  }

  if (command.kind === "start" && result.identity) {
    await safeAuditLog(
      buildAuditEventFromCtx(ctx, "channel.pair_confirmed", {
        channel_identity_id: result.identity.channel_identity_id,
        state: result.identity.state || null
      })
    );
  }

  if (
    (command.kind === "approve" || command.kind === "deny") &&
    command.confirm === true &&
    typeof result.text === "string" &&
    (result.text.startsWith("Approved:") || result.text.startsWith("Denied:"))
  ) {
    await safeAuditLog(
      buildAuditEventFromCtx(ctx, "approval.resolved", {
        approval_id: command.approvalId,
        decision: command.kind === "approve" ? "APPROVED" : "DENIED"
      })
    );
  }

  if (
    command.kind === "unpair" &&
    command.confirm === true &&
    typeof result.text === "string" &&
    result.text.startsWith("Unpaired:")
  ) {
    await safeAuditLog(
      buildAuditEventFromCtx(ctx, "pairing.revoked", {
        channel_identity_id: command.channelIdentityId
      })
    );
  }

  if (callbackQueryId) {
    return jsonResponse(
      200,
      buildTelegramAnswerCallbackQuery({
        callbackQueryId,
        text: truncateTelegramCallbackText(result.text || "OK")
      })
    );
  }

  const responseBody = buildTelegramSendMessage({
    chatId,
    text: result.text || "OK",
    disableWebPagePreview: true,
    replyMarkup: result.replyMarkup || null
  });

  return jsonResponse(200, responseBody);
}

export default withApiMiddlewares(handler, {
  routeGroup: "channels.telegram.webhook",
  enableRateLimit: false,
  enableIdempotency: false
});
