import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { getEntityTimeline } from "../../../server/services/timeline";
import { decodeAuditCursor } from "../../../server/services/audit-cursor";
import { isUuid } from "../../../server/utils/validators";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "timeline.viewed";
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

  const includeCorrelatedRaw = resolveParam(req.query?.include_correlated);
  const includeCorrelated = includeCorrelatedRaw !== "false";

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

  const cursorRaw = resolveParam(req.query?.cursor);
  let cursor = null;
  if (cursorRaw) {
    const parsed = decodeAuditCursor(cursorRaw);
    if (parsed?.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
    }
    cursor = cursorRaw;
  }

  try {
    const result = await getEntityTimeline({
      entityType,
      entityId,
      includeCorrelated,
      limit,
      cursor
    });

    return jsonResponse(200, {
      entity: result.entity,
      items: result.items,
      next_cursor: result.nextCursor,
      correlation: result.correlation
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "audit.read" }));
