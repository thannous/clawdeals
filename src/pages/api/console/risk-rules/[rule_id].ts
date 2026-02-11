import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { updateRiskRule } from "../../../../server/services/risk-rules";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "PATCH") {
    return methodNotAllowed(["PATCH"]);
  }

  if (ctx) {
    ctx.auditEvent = "risk_rule.updated";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const ruleId = resolveParam(req.query?.rule_id);
  if (!isUuid(ruleId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "rule_id must be a UUID"));
  }

  const body = req.body || {};
  const patch = {
    ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    ...(body.threshold !== undefined ? { threshold: body.threshold } : {}),
    ...(body.window_seconds !== undefined ? { window_seconds: body.window_seconds } : {}),
    ...(body.cooldown_seconds !== undefined ? { cooldown_seconds: body.cooldown_seconds } : {}),
    ...(body.flag !== undefined ? { flag: body.flag } : {})
  };

  if (Object.keys(patch).length === 0) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "No patch fields provided"));
  }

  try {
    const item = await updateRiskRule({
      ruleId,
      patch,
      updatedBy: ctx.ownerId
    });
    return jsonResponse(200, { item });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.risk_rules.write" }));

