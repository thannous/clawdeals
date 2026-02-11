import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { RISK_FLAG_VALUES } from "../../../../shared/risk-rules";
import { manualUnflagRiskFlag } from "../../../../server/services/risk-rules";

const RISK_FLAG_SET = new Set(RISK_FLAG_VALUES);

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx) {
    ctx.auditEvent = "risk_rule.flag_removed_manual";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const body = req.body || {};
  const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
  const flag = typeof body.flag === "string" ? body.flag.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!isUuid(agentId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_id must be a UUID"));
  }
  if (!RISK_FLAG_SET.has(flag as any)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "flag is invalid"));
  }
  if (!reason) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason is required"));
  }
  if (reason.length > 1000) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "reason must be at most 1000 characters"));
  }

  try {
    const result = await manualUnflagRiskFlag({
      agentId,
      flag,
      reason,
      actor: { type: "owner", id: ctx.ownerId }
    });
    return jsonResponse(200, { result });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.risk_rules.write" }));

