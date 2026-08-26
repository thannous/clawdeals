import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { resetSandboxFixtures } from "../../../../server/services/sandbox-fixtures";
import { isSandboxEnv } from "../../../../server/config/runtime";
import { assertSandboxNotProductionTarget } from "../../../../server/config/sandbox-target";

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "POST") {
    return methodNotAllowed(["GET", "POST"]);
  }

  if (!isSandboxEnv()) {
    // Do not leak sandbox capabilities in non-sandbox environments.
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

  if (req.method === "GET") {
    return jsonResponse(200, {
      enabled: Boolean(judgeAgentId),
      authorized: Boolean(judgeAgentId && !ctx?.authError && ctx?.agentId === judgeAgentId)
    });
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const requestedMode = req.body?.mode;
  if (requestedMode !== undefined && requestedMode !== "webmcp_challenge") {
    return jsonResponse(
      400,
      errorPayload("VALIDATION_ERROR", "Unsupported sandbox reset mode")
    );
  }
  const judgeMode = requestedMode === "webmcp_challenge";
  if (judgeMode) {
    if (!judgeAgentId) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
    }
    if (ctx.agentId !== judgeAgentId) {
      return jsonResponse(
        403,
        errorPayload("JUDGE_ACCESS_REQUIRED", "This reset is restricted to the configured judge agent")
      );
    }
  }

  if (ctx) {
    ctx.auditEvent = judgeMode ? "sandbox.webmcp_challenge.reset" : "sandbox.reset";
    ctx.body = { action: ctx.auditEvent };
  }

  try {
    const result = await resetSandboxFixtures({ agentId: ctx.agentId, judgeMode });
    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(
      error.status || 500,
      errorPayload(error.code || "ERROR", error.message || "Sandbox reset failed", error.details)
    );
  }
}

export default withApiMiddlewares(handler, { routeGroup: "sandbox.reset", enableIdempotency: false });
