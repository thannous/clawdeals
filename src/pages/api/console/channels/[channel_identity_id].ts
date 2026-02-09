import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import {
  approvePairing,
  denyPairing,
  getChannelIdentity,
  revokePairing
} from "../../../../server/services/channel-identities";
import { createChannelFingerprints } from "../../../../server/utils/channel-fingerprint";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

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

function attachChannelHashesToSecurity(ctx: any, identity: any) {
  if (!ctx || !identity) return;
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

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "POST") {
    return methodNotAllowed(["GET", "POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const channelIdentityId = resolveParam(req.query?.channel_identity_id);
  if (!channelIdentityId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "channel_identity_id is required"));
  }

  if (req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "pairing.viewed";
    }

    try {
      const identity = await getChannelIdentity({ ownerId: ctx.ownerId, channelIdentityId });
      if (!identity) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Channel identity not found"));
      }
      attachChannelHashesToSecurity(ctx, identity);
      return jsonResponse(200, { identity: sanitizeIdentity(identity) });
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  // POST: mutate
  const body = req.body || {};
  const action = body.action;
  if (action !== "approve" && action !== "deny" && action !== "revoke") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "action must be 'approve', 'deny', or 'revoke'"));
  }

  try {
    if (action === "approve") {
      if (ctx) {
        ctx.auditEvent = "pairing.approved";
      }
      const updated = await approvePairing({
        ownerId: ctx.ownerId,
        channelIdentityId,
        role: body.role || "approver",
        approvedBy: ctx.ownerId
      });
      attachChannelHashesToSecurity(ctx, updated);
      return jsonResponse(200, { identity: sanitizeIdentity(updated) });
    }

    if (action === "deny") {
      if (ctx) {
        ctx.auditEvent = "pairing.denied";
      }
      const updated = await denyPairing({
        ownerId: ctx.ownerId,
        channelIdentityId,
        deniedBy: ctx.ownerId
      });
      attachChannelHashesToSecurity(ctx, updated);
      return jsonResponse(200, { identity: sanitizeIdentity(updated) });
    }

    if (ctx) {
      ctx.auditEvent = "pairing.revoked";
    }
    const updated = await revokePairing({
      ownerId: ctx.ownerId,
      channelIdentityId,
      revokedBy: ctx.ownerId
    });
    attachChannelHashesToSecurity(ctx, updated);
    return jsonResponse(200, { identity: sanitizeIdentity(updated) });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

const getHandler = injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "channels.pairings.read" }));
const postHandler = injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "channels.pairings.write" }));

export default async function consoleChannelPairing(req, res) {
  if (req.method === "GET") return getHandler(req, res);
  if (req.method === "POST") return postHandler(req, res);
  return getHandler(req, res);
}
