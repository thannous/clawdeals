import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { revokeInstallationForOwner } from "../../../../server/services/agent-installations";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function resolveHeader(req: any, name: string) {
  const value = req?.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeReason(value: any) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return { error: "reason must be a string" };
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 200) return { error: "reason must be at most 200 characters" };
  return trimmed;
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
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

  const idAction = String(resolveParam(req.query?.id_action) || "");
  const [installationId, action] = idAction.split(":");
  if (!installationId || !action) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }
  if (!isUuid(installationId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "installation_id must be a UUID"));
  }
  if (action !== "revoke") {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }

  const idemKey = resolveHeader(req, "idempotency-key");
  if (!idemKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const body = req.body || {};
  const normalizedReason = normalizeReason(body.reason);
  if (normalizedReason && typeof normalizedReason === "object" && "error" in normalizedReason) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", normalizedReason.error));
  }
  const reason = typeof normalizedReason === "string" ? normalizedReason : null;

  if (ctx) {
    ctx.auditEvent = "installation.revoked";
    ctx.auditEntityType = "installation";
    ctx.auditEntityId = installationId;
    ctx.security = {
      installation_id: installationId,
      reason
    };
  }

  try {
    const revoked: any = await revokeInstallationForOwner({
      ownerId,
      installationId,
      reason,
      now: new Date()
    });

    return jsonResponse(200, {
      installation_id: revoked.installation_id,
      status: "REVOKED",
      revoked_at: revoked.revoked_at
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "installations.revoke"
});
