import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { createChannelFingerprints } from "../../../../../server/utils/channel-fingerprint";
import { createPairToken, consumePairToken } from "../../../../../server/services/pairing-tokens";
import { pairChannelIdentityForOwner } from "../../../../../server/services/channel-pairing";
import { sendTelegramMessage } from "../../../../../server/channels/telegram/client";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function requireOwnerAuth(ctx: any) {
  if (ctx?.authError) {
    throw Object.assign(new Error(ctx.authError.message), {
      status: ctx.authError.status || 401,
      code: ctx.authError.code || "UNAUTHORIZED"
    });
  }
  if (ctx?.actor?.type !== "owner") {
    throw Object.assign(new Error("Owner authentication required"), { status: 401, code: "UNAUTHORIZED" });
  }
  const ownerId = ctx?.ownerId || null;
  if (!ownerId) throw Object.assign(new Error("Owner authentication required"), { status: 401, code: "UNAUTHORIZED" });
  if (!isUuid(ownerId)) throw Object.assign(new Error("owner_id must be a UUID"), { status: 400, code: "VALIDATION_ERROR" });
  return ownerId;
}

function normalizeTelegramUsername(value: any) {
  const raw = String(value || "").trim();
  const withoutAt = raw.startsWith("@") ? raw.slice(1) : raw;
  return withoutAt.trim();
}

function toApiChannel(identity: any) {
  return {
    channel_account_id: identity.channel_identity_id,
    channel_type: identity.channel_type,
    display_name: identity.display_name ?? null,
    role: identity.role ?? null,
    created_at: identity.created_at ?? null,
    approved_at: identity.approved_at ?? null,
    revoked_at: identity.revoked_at ?? null,
    last_seen_at: identity.last_seen_at ?? null
  };
}

export async function handler(req, res, ctx) {
  const action = String(resolveParam(req.query?.action) || "");

  if (action === "pair:start") {
    if (req.method !== "POST") return methodNotAllowed(["POST"]);

    try {
      const ownerId = requireOwnerAuth(ctx);

      let username = normalizeTelegramUsername(process.env.TELEGRAM_BOT_USERNAME);
      // In dev/test, keep pairing flows usable without requiring env wiring.
      if (!username && process.env.NODE_ENV !== "production") {
        username = "clawdeals_bot";
      }
      if (!username) {
        return jsonResponse(500, errorPayload("MISSING_TELEGRAM_BOT_USERNAME", "TELEGRAM_BOT_USERNAME is required"));
      }

      if (ctx) ctx.auditEvent = "channel.pair_started";

      const token = await createPairToken({
        tokenType: "WEB_TO_CHANNEL",
        ownerId,
        channelType: "telegram",
        channelContextId: "",
        now: new Date()
      });

      const telegramDeeplink = `https://t.me/${username}?start=${encodeURIComponent(token.pair_token)}`;

      return jsonResponse(201, {
        data: {
          pair_token: token.pair_token,
          expires_at: token.expires_at,
          telegram_deeplink: telegramDeeplink
        }
      });
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  if (action === "pair:confirm") {
    if (req.method !== "POST") return methodNotAllowed(["POST"]);

    try {
      const ownerId = requireOwnerAuth(ctx);

      if (ctx) ctx.auditEvent = "channel.pair_confirmed";

      const pairToken = req.body?.pair_token;
      const consumed: any = await consumePairToken({
        pairToken,
        expectedType: "CHANNEL_TO_WEB",
        ownerId,
        now: new Date()
      });

      const channelType = consumed.channel_type || "telegram";
      const channelUserId = consumed.channel_user_id;
      const channelContextId = consumed.channel_context_id;
      const displayName = consumed.display_name || null;

      const result = await pairChannelIdentityForOwner({
        ownerId,
        channelType,
        channelUserId,
        channelContextId,
        displayName,
        now: new Date()
      });

      // Best-effort Telegram confirmation.
      const confirmationText =
        result.state === "PAIRED"
          ? "Connected. Your channel is now paired."
          : "Pairing requested. Status: PENDING_APPROVAL. Approve it in the console to enable write commands.";

      const sendResult = await sendTelegramMessage({
        chatId: String(channelContextId || ""),
        text: confirmationText
      });

      if (ctx) {
        let hashes: any = null;
        try {
          hashes = createChannelFingerprints({ channelType, channelUserId, channelContextId });
        } catch {
          hashes = null;
        }
        ctx.security = {
          ...(ctx.security || {}),
          channel_type: channelType,
          channel_identity_id: result.identity?.channel_identity_id || null,
          ...(hashes ? hashes : {})
        };
      }

      return jsonResponse(200, {
        data: {
          channel: toApiChannel(result.identity),
          state: result.state,
          telegram_notified: Boolean(sendResult.ok)
        }
      });
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
}

const startHandler = withApiMiddlewares(handler, { routeGroup: "channels.pairings.write" });
const confirmHandler = withApiMiddlewares(handler, { routeGroup: "channels.pairing_confirm" });

export default async function channelsTelegramAction(req, res) {
  const action = String(resolveParam(req.query?.action) || "");
  if (action === "pair:confirm") return confirmHandler(req, res);
  return startHandler(req, res);
}
