import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { denyPairing, getChannelIdentity, revokePairing } from "../../../../../server/services/channel-identities";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function getHeaderValue(req: any, name: string) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function toIdentity(row: any) {
  return {
    identity_id: row.channel_identity_id,
    channel_type: row.channel_type,
    display_name: row.display_name ?? null,
    role: row.role ?? null,
    state: row.state,
    created_at: row.created_at ?? null,
    approved_at: row.approved_at ?? null,
    revoked_at: row.revoked_at ?? null,
    last_seen_at: row.last_seen_at ?? null
  };
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET" && req.method !== "DELETE") {
    return methodNotAllowed(["GET", "DELETE"]);
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

  const identityId = resolveParam(req.query?.identity_id);
  if (!isUuid(identityId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "identity_id must be a UUID"));
  }

  if (req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "owner.identity_viewed";
      ctx.auditEntityType = "channel_identity";
      ctx.auditEntityId = identityId;
    }

    try {
      const identity = await getChannelIdentity({ ownerId, channelIdentityId: identityId });
      if (!identity) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Channel identity not found"));
      }
      return jsonResponse(200, { data: toIdentity(identity) }, { "Cache-Control": "no-store" });
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  try {
    const existing = await getChannelIdentity({ ownerId, channelIdentityId: identityId });
    if (!existing) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Channel identity not found"));
    }

    // Idempotent-ish behavior: already REVOKED returns 200 without error.
    if (existing.state === "REVOKED") {
      if (ctx) {
        ctx.auditEvent = "owner.identity_unlinked";
        ctx.auditEntityType = "channel_identity";
        ctx.auditEntityId = identityId;
      }
      return jsonResponse(200, { data: toIdentity(existing) }, { "Cache-Control": "no-store" });
    }

    const now = new Date();
    if (existing.state === "ACTIVE") {
      const updated = await revokePairing({ ownerId, channelIdentityId: identityId, revokedBy: ownerId, now });
      if (ctx) {
        ctx.auditEvent = "owner.identity_unlinked";
        ctx.auditEntityType = "channel_identity";
        ctx.auditEntityId = identityId;
      }
      return jsonResponse(200, { data: toIdentity(updated) }, { "Cache-Control": "no-store" });
    }

    if (existing.state === "PENDING") {
      const updated = await denyPairing({ ownerId, channelIdentityId: identityId, deniedBy: ownerId, now });
      if (ctx) {
        ctx.auditEvent = "owner.identity_unlinked";
        ctx.auditEntityType = "channel_identity";
        ctx.auditEntityId = identityId;
      }
      return jsonResponse(200, { data: toIdentity(updated) }, { "Cache-Control": "no-store" });
    }

    return jsonResponse(409, errorPayload("CONFLICT", "Identity cannot be unlinked in its current state"));
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  enableIdempotency: true
});
