import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { exportAuditLogsCsv } from "../../../../server/services/audit";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "audit.export_requested";
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

  const actorType = resolveParam(req.query?.actor_type) || null;
  const actorId = resolveParam(req.query?.actor_id) || null;
  // Back-compat: older UI used `action`, but the service expects `action_name`.
  const actionName = resolveParam(req.query?.action_name) || resolveParam(req.query?.action) || null;
  const entityType = resolveParam(req.query?.entity_type) || null;
  const entityId = resolveParam(req.query?.entity_id) || null;
  const outcome = resolveParam(req.query?.outcome) || null;

  try {
    const csv = await exportAuditLogsCsv({
      from, to, actorType, actorId, actionName, entityType, entityId, outcome
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-export-${timestamp}.csv"`);
    res.end(csv);
    return null;
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "audit.export" }));
