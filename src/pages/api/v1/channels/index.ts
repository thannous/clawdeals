import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { listChannelIdentities } from "../../../../server/services/channel-identities";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

const STATES = new Set(["PENDING", "ACTIVE", "REVOKED"]);

function mapChannelState(dbState: string) {
  const st = String(dbState || "").toUpperCase();
  if (st === "ACTIVE") return "PAIRED";
  if (st === "PENDING") return "PENDING_APPROVAL";
  if (st === "REVOKED") return "REVOKED";
  return "UNKNOWN";
}

function toApiChannel(row: any) {
  return {
    channel_account_id: row.channel_identity_id,
    channel_type: row.channel_type,
    display_name: row.display_name ?? null,
    role: row.role ?? null,
    state: mapChannelState(row.state),
    created_at: row.created_at ?? null,
    paired_at: row.approved_at ?? null,
    revoked_at: row.revoked_at ?? null,
    last_seen_at: row.last_seen_at ?? null
  };
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (ctx?.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const ownerId = ctx?.ownerId || null;
  if (!ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }

  const rawState = resolveParam(req.query?.state);
  const state = rawState ? String(rawState).toUpperCase() : null;
  if (state && !STATES.has(state)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "state is invalid"));
  }

  const channelType = resolveParam(req.query?.channel_type) || null;

  const rawLimit = resolveParam(req.query?.limit);
  let limit = 50;
  if (rawLimit !== null && rawLimit !== undefined && rawLimit !== "") {
    const parsed = Number.parseInt(String(rawLimit), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > 100) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be between 1 and 100"));
    }
    limit = parsed;
  }

  if (ctx) ctx.auditEvent = "channels.listed";

  try {
    const rows = await listChannelIdentities({ ownerId, state, channelType, limit });
    return jsonResponse(200, {
      data: {
        channels: (rows || []).map(toApiChannel)
      }
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "channels.pairings.read",
  enableIdempotency: false
});

