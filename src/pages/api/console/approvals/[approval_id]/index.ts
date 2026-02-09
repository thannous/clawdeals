import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getApproval, resolveApproval } from "../../../../../server/services/approvals";
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

  const approvalId = resolveParam(req.query?.approval_id);
  if (!isUuid(approvalId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "approval_id must be a UUID"));
  }

  if (req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "approval.viewed";
    }

    try {
      const approval = await getApproval(approvalId);
      if (!approval) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Approval not found"));
      }
      return jsonResponse(200, { approval });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  // POST: resolve approval
  if (ctx) {
    ctx.auditEvent = "approval.resolved";
  }

  const body = req.body || {};
  const action = body.action;
  if (action !== "approve" && action !== "deny") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "action must be 'approve' or 'deny'"));
  }

  const reason = body.reason != null ? String(body.reason).slice(0, 500) : undefined;

  try {
    const approval = await getApproval(approvalId);
    if (!approval) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Approval not found"));
    }

    if (approval.state !== "PENDING") {
      return jsonResponse(409, errorPayload("CONFLICT", "Approval already resolved"));
    }

    const result = await resolveApproval({
      approvalId,
      ownerId: approval.owner_id,
      decision: action === "approve" ? "APPROVED" : "DENIED",
      resolvedBy: ctx.ownerId,
      reason
    });

    return jsonResponse(200, { approval: result });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

// Rate limits should reflect the effective action. GET is read-only and should not consume
// the write bucket; otherwise long integration suites can trip 429s on harmless fetches.
const getHandler = injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "approvals.read" }));
const postHandler = injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.approvals.write" }));

export default function approvalsById(req, res) {
  if (req.method === "GET") return getHandler(req, res);
  return postHandler(req, res);
}
