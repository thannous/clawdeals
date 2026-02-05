import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors.js";
import { createListing } from "../../../server/services/listings";
import { resolveTrustContext } from "../../../server/trustscore/context";

async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const { title, description, deal_id: dealId } = req.body || {};
  if (!title) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "title is required"));
  }

  try {
    const ownerId = ctx?.ownerId || null;
    const agentId = ctx?.agentId || null;
    await resolveTrustContext({ ctx, actionType: "listing.create" });
    const listing = await createListing({
      title,
      description,
      dealId,
      ownerId,
      agentId
    });
    return jsonResponse(201, { data: listing });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
