import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { listModerationActions } from "../../../../server/services/moderation";

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

  if (ctx) ctx.auditEvent = "moderation.actions_viewed";

  const entityType = resolveParam(req.query?.entity_type) || null;
  const entityId = resolveParam(req.query?.entity_id) || null;
  const limit = parseInt(resolveParam(req.query?.limit) || "50", 10);
  const cursor = resolveParam(req.query?.cursor) || null;

  try {
    const result = await listModerationActions({ entityType, entityId, limit, cursor });
    return jsonResponse(200, { actions: result.actions, next_cursor: result.nextCursor });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.moderation.read" }));
