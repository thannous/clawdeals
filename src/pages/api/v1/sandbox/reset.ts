import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { resetSandboxFixtures } from "../../../../server/services/sandbox-fixtures";
import { isSandboxEnv } from "../../../../server/config/runtime";

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (!isSandboxEnv()) {
    // Do not leak sandbox capabilities in non-sandbox environments.
    return jsonResponse(404, errorPayload("NOT_FOUND", "Not found"));
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  if (ctx) {
    ctx.auditEvent = "sandbox.reset";
    ctx.body = { action: "sandbox.reset" };
  }

  try {
    const result = await resetSandboxFixtures({ agentId: ctx.agentId });
    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(
      error.status || 500,
      errorPayload(error.code || "ERROR", error.message || "Sandbox reset failed", error.details)
    );
  }
}

export default withApiMiddlewares(handler, { routeGroup: "sandbox.reset", enableIdempotency: false });
