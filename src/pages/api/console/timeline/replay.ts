import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { replayEntityState } from "../../../../server/services/timeline";
import { isUuid } from "../../../../server/utils/validators";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "timeline.replay.viewed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const entityType = resolveParam(req.query?.entity_type) || null;
  if (!entityType) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "entity_type is required"));
  }

  const entityId = resolveParam(req.query?.entity_id) || null;
  if (!entityId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "entity_id is required"));
  }
  if (!isUuid(entityId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "entity_id must be a valid UUID"));
  }

  const upToAuditId = resolveParam(req.query?.up_to_audit_id) || null;
  if (upToAuditId && !isUuid(upToAuditId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "up_to_audit_id must be a valid UUID"));
  }

  try {
    const result = await replayEntityState({
      entityType,
      entityId,
      upToAuditId
    });

    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "audit.read" }));
