import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors.js";
import { createReport } from "../../../server/services/reports";

async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const { subject, description } = req.body || {};
  if (!subject) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "subject is required"));
  }

  try {
    const ownerId = ctx?.ownerId || null;
    const agentId = ctx?.agentId || null;
    const actorId = ownerId || agentId || null;
    const report = await createReport({ subject, description, actorId });
    return jsonResponse(201, { data: report });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
