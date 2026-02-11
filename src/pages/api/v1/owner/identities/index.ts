import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getOwner } from "../../../../../server/services/owners";
import { listChannelIdentities } from "../../../../../server/services/channel-identities";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function maskEmail(email: string) {
  const raw = String(email || "").trim();
  if (!raw) return null;
  const [user, domain] = raw.split("@");
  if (!user || !domain) return null;
  return `${user[0]}***@${domain}`;
}

export async function handler(req: any, _res: any, ctx: any) {
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

  if (ctx) {
    ctx.auditEvent = "owner.identities_listed";
    ctx.auditEntityType = "owner";
    ctx.auditEntityId = ownerId;
  }

  try {
    const [owner, channels] = await Promise.all([
      getOwner(ownerId),
      listChannelIdentities({ ownerId, limit })
    ]);

    if (!owner) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Owner not found"));
    }

    return jsonResponse(
      200,
      {
        data: {
          owner_id: owner.owner_id,
          email_masked: owner.email ? maskEmail(owner.email) : null,
          email_verified_at: owner.email_verified_at ?? null,
          channels: (channels || []).map((row: any) => ({
            identity_id: row.channel_identity_id,
            channel_type: row.channel_type,
            display_name: row.display_name ?? null,
            role: row.role ?? null,
            state: row.state,
            created_at: row.created_at ?? null,
            approved_at: row.approved_at ?? null,
            revoked_at: row.revoked_at ?? null,
            last_seen_at: row.last_seen_at ?? null
          }))
        }
      },
      { "Cache-Control": "no-store" }
    );
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  enableIdempotency: false
});
