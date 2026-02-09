import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { revokeApiKeyOps } from "../../../../server/services/moderation";
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

  if (ctx) ctx.auditEvent = "moderation.key_revoked";

  const body = req.body || {};
  const { agent_id, api_key_id, reason } = body;

  if (!isUuid(agent_id)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_id must be a UUID"));
  }
  if (!isUuid(api_key_id)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "api_key_id must be a UUID"));
  }

  try {
    const result = await revokeApiKeyOps({
      agentId: agent_id,
      apiKeyId: api_key_id,
      reason: reason || null,
      performedBy: ctx.ownerId
    });
    return jsonResponse(200, { result });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.moderation.write" }));
