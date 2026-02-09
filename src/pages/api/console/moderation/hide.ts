import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { hideEntity } from "../../../../server/services/moderation";
import { isUuid } from "../../../../server/utils/validators";

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

  if (ctx) ctx.auditEvent = "moderation.entity_hidden";

  const body = req.body || {};
  const { entity_type, entity_id, reason } = body;

  if (!entity_type || typeof entity_type !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "entity_type is required"));
  }
  if (!isUuid(entity_id)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "entity_id must be a UUID"));
  }

  try {
    const result = await hideEntity({
      entityType: entity_type,
      entityId: entity_id,
      reason: reason || null,
      performedBy: ctx.ownerId
    });
    return jsonResponse(200, { moderation_state: result });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.moderation.write" }));
