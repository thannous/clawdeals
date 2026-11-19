import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { listDisputesForReview } from "../../../../server/services/protected-checkout";

const STATUSES = new Set(["OPEN", "UNDER_REVIEW", "RESOLVED"]);

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "disputes.listed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const rawStatus = resolveParam(req.query?.status);
  const status = rawStatus ? String(rawStatus).toUpperCase() : null;
  if (status && !STATUSES.has(status)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "status is invalid"));
  }

  try {
    const disputes = await listDisputesForReview({ status });
    return jsonResponse(200, { disputes }, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(
  withApiMiddlewares(handler, { routeGroup: "console.disputes.read", enableIdempotency: false })
);
