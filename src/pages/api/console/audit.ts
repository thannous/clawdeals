import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { listAuditLogs } from "../../../server/services/audit";
import { decodeAuditCursor } from "../../../server/services/audit-cursor";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "audit.listed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const from = resolveParam(req.query?.from) || null;
  const to = resolveParam(req.query?.to) || null;

  if (!from || !to) {
    return jsonResponse(400, errorPayload("TIME_RANGE_REQUIRED", "Both from and to parameters are required"));
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "from and to must be valid ISO dates"));
  }

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
    cursor = parsed?.value || null;
  }

  const actorType = resolveParam(req.query?.actor_type) || null;
  const actorId = resolveParam(req.query?.actor_id) || null;
  // Back-compat: older UI used `action`, but the service expects `action_name`.
  const actionName = resolveParam(req.query?.action_name) || resolveParam(req.query?.action) || null;
  const entityType = resolveParam(req.query?.entity_type) || null;
  const entityId = resolveParam(req.query?.entity_id) || null;
  const outcome = resolveParam(req.query?.outcome) || null;
  const requestId = resolveParam(req.query?.request_id) || null;

  try {
    const result = await listAuditLogs({
      from, to, actorType, actorId, actionName, entityType, entityId, outcome, requestId, limit, cursor
    });

    return jsonResponse(200, { items: result.items, next_cursor: result.nextCursor });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "audit.read" }));
