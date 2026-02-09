import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { bulkResolveReports } from "../../../../server/services/report-moderation";
import { isUuid } from "../../../../server/utils/validators";

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx) {
    ctx.auditEvent = "reports.bulk_resolved";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const body = req.body || {};

  // Validate report_ids
  const reportIds = body.report_ids;
  if (!Array.isArray(reportIds)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "report_ids must be an array"));
  }
  if (reportIds.length < 1 || reportIds.length > 100) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "report_ids must contain between 1 and 100 items"));
  }
  for (const id of reportIds) {
    if (!isUuid(id)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", `Invalid UUID in report_ids: ${id}`));
    }
  }

  // Validate action
  const action = body.action;
  if (action !== "confirm" && action !== "reject") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "action must be 'confirm' or 'reject'"));
  }

  // Validate reason
  let reason = body.reason;
  if (reason === undefined || reason === null || reason === "") {
    reason = null;
  } else if (typeof reason !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason must be a string"));
  } else if (reason.length > 1000) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason must be at most 1000 characters"));
  }

  try {
    const result = await bulkResolveReports({
      reportIds,
      action,
      reason,
      resolvedBy: ctx.ownerId
    });
    return jsonResponse(200, { resolved: result.resolved, skipped: result.skipped });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.reports.write" }));
