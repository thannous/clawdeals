import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { rateLimitMiddleware } from "../../../../../server/rate-limit/middleware";
import { getOpsConsoleOwnerId } from "../../../../../server/config/ops";
import { safeAuditLog } from "../../../../../server/audit/singleton";
import { createChannelFingerprints } from "../../../../../server/utils/channel-fingerprint";
import { parseCommand } from "../../../../../server/channels/commands/parser";
import { executeChannelCommand } from "../../../../../server/channels/commands/execute";
import { buildTelegramSendMessage } from "../../../../../server/channels/commands/format";

function readHeader(headers: any, name: string) {
  if (!headers) return null;
  const direct = headers[name];
  if (Array.isArray(direct)) return direct[0] || null;
  if (direct) return direct;
  const lower = headers[String(name).toLowerCase()];
  if (Array.isArray(lower)) return lower[0] || null;
  return lower || null;
}

function isEnabledFlag(value: any) {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function respondNotFound() {
  return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
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

async function applyChannelRateLimit({ req, ctx, group, channelId }: any) {
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
    }
    return jsonResponse(result.status, result.body, result.headers);
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

function resolveTelegramDisplayName(from: any) {
  if (!from || typeof from !== "object") return null;
  const username = typeof from.username === "string" && from.username.trim() ? from.username.trim() : null;
  if (username) return username;
  const first = typeof from.first_name === "string" ? from.first_name.trim() : "";
  const last = typeof from.last_name === "string" ? from.last_name.trim() : "";
  const full = `${first} ${last}`.trim();
  return full || null;
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (process.env.NODE_ENV === "production" && !isEnabledFlag(process.env.CHANNEL_COMMANDS_ENABLED)) {
    return respondNotFound();
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || null;
  const secretHeader = readHeader(req.headers, "x-telegram-bot-api-secret-token");
  const shouldEnforceSecret = process.env.NODE_ENV === "production" || Boolean(expectedSecret);
  if (shouldEnforceSecret) {
    if (!expectedSecret || !secretHeader || secretHeader !== expectedSecret) {
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Invalid Telegram secret token"));
    }
  }

  const message = resolveTelegramMessage(req.body);
  const text = typeof message?.text === "string" ? message.text : "";
  if (!text) {
    return jsonResponse(200, { ok: true });
  }

  const from = message?.from || null;
  const chat = message?.chat || null;
  const channelUserId = from?.id != null ? String(from.id) : "";
  const chatId = chat?.id != null ? String(chat.id) : "";
  if (!channelUserId || !chatId) {
    return jsonResponse(200, { ok: true });
  }

  const channelType = "telegram";
  const channelContextId = chatId;
  const displayName = resolveTelegramDisplayName(from);

  const command = parseCommand(text);

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
        message_id: message?.message_id ?? null,
        chat_type: typeof chat?.type === "string" ? chat.type : null,
        text_len: text.length
      }
    };
    ctx.auditEvent = "channel.command_received";
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

  // Base rate limit (per channel user).
  const webhookRl = await applyChannelRateLimit({
    req,
    ctx,
    group: "channels.telegram.webhook",
    channelId: channelRateLimitId
  });
  if (webhookRl) return webhookRl;

  // Pairing start is more sensitive (abuse / brute force).
  if (command.kind === "pair") {
    const pairRl = await applyChannelRateLimit({ req, ctx, group: "channels.pair", channelId: channelRateLimitId });
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
      channelId: channelRateLimitId
    });
    if (confirmRl) return confirmRl;
  }

  const ownerId = getOpsConsoleOwnerId();

  let result: any;
  try {
    result = await executeChannelCommand({
      ownerId,
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
    const responseBody = buildTelegramSendMessage({
      chatId,
      text: `Error: ${error?.message || "Unexpected error"}`,
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
    ctx.outcome = { type: "BLOCKED", reason: "not_allowlisted" };
    await safeAuditLog(buildAuditEventFromCtx(ctx, "command.blocked_not_allowlisted", { command: command.kind }, "BLOCKED"));
  }

  if (command.kind === "pair" && result.identity) {
    await safeAuditLog(buildAuditEventFromCtx(ctx, "pairing.started", {
      channel_identity_id: result.identity.channel_identity_id
    }));
  }

  if (
    (command.kind === "approve" || command.kind === "deny") &&
    command.confirm === true &&
    typeof result.text === "string" &&
    (result.text.startsWith("Approved:") || result.text.startsWith("Denied:"))
  ) {
    await safeAuditLog(buildAuditEventFromCtx(ctx, "approval.resolved", {
      approval_id: command.approvalId,
      decision: command.kind === "approve" ? "APPROVED" : "DENIED"
    }));
  }

  if (
    command.kind === "unpair" &&
    command.confirm === true &&
    typeof result.text === "string" &&
    result.text.startsWith("Unpaired:")
  ) {
    await safeAuditLog(buildAuditEventFromCtx(ctx, "pairing.revoked", {
      channel_identity_id: command.channelIdentityId
    }));
  }

  const responseBody = buildTelegramSendMessage({
    chatId,
    text: result.text || "OK",
    disableWebPagePreview: true
  });

  return jsonResponse(200, responseBody);
}

export default withApiMiddlewares(handler, {
  routeGroup: "channels.telegram.webhook",
  enableRateLimit: false,
  enableIdempotency: false
});
