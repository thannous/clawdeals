import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { getModerationState } from "../../../../server/services/moderation";
import { isUuid } from "../../../../server/utils/validators";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  if (ctx) ctx.auditEvent = "moderation.state_viewed";

  const entityType = resolveParam(req.query?.entity_type);
  const entityId = resolveParam(req.query?.entity_id);

  if (!entityType || typeof entityType !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "entity_type is required"));
  }
  if (!isUuid(entityId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "entity_id must be a UUID"));
  }

  try {
    const state = await getModerationState({ entityType, entityId });
    return jsonResponse(200, { moderation_state: state });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.moderation.read" }));
