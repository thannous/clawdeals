import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { listChannelIdentities } from "../../../../server/services/channel-identities";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

const STATES = new Set(["PENDING", "ACTIVE", "REVOKED"]);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "pairings.listed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const rawState = resolveParam(req.query?.state) || "PENDING";
  const state = String(rawState).toUpperCase();
  if (state && !STATES.has(state)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "state is invalid"));
  }

  const channelType = resolveParam(req.query?.channel_type) || null;

  const limitRaw = resolveParam(req.query?.limit);
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== undefined && limitRaw !== null && limitRaw !== "") {
    const parsed = Number.parseInt(String(limitRaw), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > MAX_LIMIT) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${MAX_LIMIT}`));
    }
    limit = parsed;
  }

  try {
    const items = await listChannelIdentities({
      ownerId: ctx.ownerId,
      state,
      channelType,
      limit
    });

    return jsonResponse(200, { items: items.map(sanitizeIdentity) });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "channels.pairings.read" }));

