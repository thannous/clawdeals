import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { confirmPairingCode } from "../../../../server/services/channel-identities";
import { createChannelFingerprints } from "../../../../server/utils/channel-fingerprint";

function sanitizeIdentity(row: any) {
  if (!row) return row;
  const {
    channel_user_id: _channelUserId,
    channel_context_id: _channelContextId,
    pairing_code_hash: _pairingCodeHash,
    ...rest
  } = row;
  return rest;
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const code = req.body?.code;

  try {
    const result: any = await confirmPairingCode({ ownerId: ctx.ownerId, code });
    if (!result.ok) {
      if (ctx) {
        ctx.auditEvent = "pairing.code_failed";
      }
      if (result.reason === "expired") {
        return jsonResponse(410, errorPayload("PAIRING_EXPIRED", "Pairing code expired"));
      }
      return jsonResponse(404, errorPayload("PAIRING_CODE_INVALID", "Invalid pairing code"));
    }

    const identity = result.identity;
    if (ctx && identity) {
      ctx.auditEvent = "pairing.code_confirmed";
      let hashes: any = null;
      try {
        hashes = createChannelFingerprints({
          channelType: identity.channel_type,
          channelUserId: identity.channel_user_id,
          channelContextId: identity.channel_context_id
        });
      } catch (error) {
        // Fingerprinting is best-effort. In local/dev AUDIT_HMAC_SECRET may be unset.
        hashes = null;
      }

      ctx.security = {
        ...(ctx.security || {}),
        channel_type: identity.channel_type,
        channel_identity_id: identity.channel_identity_id,
        ...(hashes
          ? {
              channel_user_id_hash: hashes.channel_user_id_hash,
              channel_context_id_hash: hashes.channel_context_id_hash
            }
          : {})
      };
    }

    return jsonResponse(200, { identity: sanitizeIdentity(identity) });
  } catch (error: any) {
    if (ctx) {
      ctx.auditEvent = "pairing.code_failed";
    }
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "channels.pairing_confirm" }));
