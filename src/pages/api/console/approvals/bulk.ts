import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { bulkResolveApprovals } from "../../../../server/services/approvals";
import { isUuid } from "../../../../server/utils/validators";

const MAX_REASON_LENGTH = 500;

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

  if (ctx) {
    ctx.auditEvent = "approvals.bulk_resolved";
  }

  const body = req.body || {};
  const { approval_ids, action, reason } = body;

  if (action !== "approve" && action !== "deny") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "action must be 'approve' or 'deny'"));
  }

  if (!Array.isArray(approval_ids) || approval_ids.length === 0) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "approval_ids must be a non-empty array"));
  }

  for (const id of approval_ids) {
    if (!isUuid(id)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", `Invalid UUID: ${id}`));
    }
  }

  const truncatedReason = reason != null ? String(reason).slice(0, MAX_REASON_LENGTH) : undefined;

  try {
    const result = await bulkResolveApprovals({
      approvalIds: approval_ids,
      decision: action === "approve" ? "APPROVED" : "DENIED",
      resolvedBy: ctx.ownerId,
      reason: truncatedReason
    });

    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.approvals.write" }));
