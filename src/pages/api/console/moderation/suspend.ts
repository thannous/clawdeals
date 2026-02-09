import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { suspendAgent, suspendOwner } from "../../../../server/services/moderation";
import { isUuid } from "../../../../server/utils/validators";

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

  if (ctx) ctx.auditEvent = "moderation.suspended";

  const body = req.body || {};
  const { target_type, target_id, reason } = body;

  if (target_type !== "agent" && target_type !== "owner") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "target_type must be 'agent' or 'owner'"));
  }
  if (!isUuid(target_id)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "target_id must be a UUID"));
  }

  try {
    const result = target_type === "agent"
      ? await suspendAgent({ agentId: target_id, reason, performedBy: ctx.ownerId })
      : await suspendOwner({ ownerId: target_id, reason, performedBy: ctx.ownerId });

    return jsonResponse(200, { result });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.moderation.write" }));
