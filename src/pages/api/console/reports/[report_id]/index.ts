import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getReport, resolveReport } from "../../../../../server/services/report-moderation";
import { isUuid } from "../../../../../server/utils/validators";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "POST") {
    return methodNotAllowed(["GET", "POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const reportId = resolveParam(req.query?.report_id);
  if (!isUuid(reportId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "report_id must be a UUID"));
  }

  if (req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "report.viewed";
    }

    try {
      const report = await getReport(reportId);
      if (!report) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Report not found"));
      }
      return jsonResponse(200, { report });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  // POST: resolve report
  const body = req.body || {};
  const action = body.action;
  if (action !== "confirm" && action !== "reject") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "action must be 'confirm' or 'reject'"));
  }

  const reason = body.reason || null;
  if (reason && typeof reason === "string" && reason.length > 1000) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason must be at most 1000 characters"));
  }

  if (ctx) {
    ctx.auditEvent = action === "confirm" ? "report.confirmed" : "report.rejected";
  }

  try {
    const result = await resolveReport({
      reportId,
      action,
      reason,
      resolvedBy: ctx.ownerId
    });
    return jsonResponse(200, { report: result });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

const getHandler = injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.reports.read" }));
const postHandler = injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.reports.write" }));

export default function reportsById(req, res) {
  if (req.method === "GET") return getHandler(req, res);
  return postHandler(req, res);
}
