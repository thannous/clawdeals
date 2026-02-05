import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors.js";
import { createDeal } from "../../../server/services/deals";
import { resolveTrustContext } from "../../../server/trustscore/context";

async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const { title, description } = req.body || {};
  if (!title) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "title is required"));
  }

  try {
    const ownerId = ctx?.ownerId || null;
    const agentId = ctx?.agentId || null;
    await resolveTrustContext({ ctx, actionType: "deal.create" });
    const deal = await createDeal({
      title,
      description,
      ownerId,
      agentId
    });
    return jsonResponse(201, { data: deal });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
