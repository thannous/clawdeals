import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { runRiskRulesEngine } from "../../../../server/services/risk-rules";

function parseOptionalBoolean(value: any) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes"].includes(raw)) return true;
  if (["0", "false", "no"].includes(raw)) return false;
  return null;
}

function parseOptionalPositiveInt(value: any) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx) {
    ctx.auditEvent = "risk_rules.run";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const body = req.body || {};
  const dryRunParsed = parseOptionalBoolean(body.dry_run);
  if (body.dry_run !== undefined && dryRunParsed === null) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "dry_run must be a boolean"));
  }
  const dryRun = dryRunParsed === true;

  const ruleKey = typeof body.rule_key === "string" && body.rule_key.trim() ? body.rule_key.trim() : null;

  const maxAgentsPerRule = parseOptionalPositiveInt(body.max_agents_per_rule);
  if (body.max_agents_per_rule !== undefined && maxAgentsPerRule === null) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "max_agents_per_rule must be a positive integer"));
  }

  try {
    const summary = await runRiskRulesEngine({
      dryRun,
      ruleKey,
      maxAgentsPerRule,
      actor: { type: "owner", id: ctx.ownerId }
    });
    return jsonResponse(200, summary);
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "console.risk_rules.write" }));

