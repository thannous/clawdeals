import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { listRiskRules } from "../../../../server/services/risk-rules";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseBooleanQuery(value: any) {
  if (value === undefined || value === null || value === "") return null;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes"].includes(raw)) return true;
  if (["0", "false", "no"].includes(raw)) return false;
  return null;
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "risk_rules.listed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const enabledRaw = resolveParam(req.query?.enabled);
  const enabled = parseBooleanQuery(enabledRaw);
  if (enabledRaw !== undefined && enabledRaw !== null && enabledRaw !== "" && enabled === null) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "enabled must be a boolean"));
  }

  const ruleKeyRaw = resolveParam(req.query?.rule_key);
  const ruleKey = typeof ruleKeyRaw === "string" && ruleKeyRaw.trim() ? ruleKeyRaw.trim() : null;

  try {
    const items = await listRiskRules({
      enabledOnly: enabled === true,
      ruleKey
    });
    const filtered = enabled === false ? items.filter((item: any) => item.enabled === false) : items;
    return jsonResponse(200, { items: filtered });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.risk_rules.read" }));

