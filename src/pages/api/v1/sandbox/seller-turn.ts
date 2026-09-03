import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { runSandboxSellerTurn } from "../../../../server/services/sandbox-seller-autopilot";
import { isSandboxEnv } from "../../../../server/config/runtime";
import { assertSandboxNotProductionTarget } from "../../../../server/config/sandbox-target";

/**
 * Judge-only synthetic seller turn. Mirrors the reset guards: 404 outside the sandbox environment,
 * fail-closed on a production database target, 403 for any agent other than the configured judge.
 */
export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (!isSandboxEnv()) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
  }

  try {
    assertSandboxNotProductionTarget();
  } catch (error) {
    return jsonResponse(
      error.status || 403,
      errorPayload(error.code || "PRODUCTION_TARGET_FORBIDDEN", error.message || "Production target forbidden", error.details)
    );
  }

  const judgeAgentId = String(process.env.WEBMCP_JUDGE_AGENT_ID || "").trim();
  if (!judgeAgentId) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }
  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }
  if (ctx.agentId !== judgeAgentId) {
    return jsonResponse(
      403,
      errorPayload("JUDGE_ACCESS_REQUIRED", "The synthetic seller only answers the configured judge agent")
    );
  }

  ctx.auditEvent = "sandbox.webmcp_challenge.seller_turn";
  ctx.body = { action: ctx.auditEvent };

  try {
    const result = await runSandboxSellerTurn({ buyerAgentId: ctx.agentId, judgeAgentId });
    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(
      error.status || 500,
      errorPayload(error.code || "ERROR", error.message || "Seller turn failed", error.details)
    );
  }
}

export default withApiMiddlewares(handler, { routeGroup: "sandbox.reset", enableIdempotency: false });
