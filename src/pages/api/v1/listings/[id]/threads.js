import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors.js";
import { createThread } from "../../../../../server/services/threads";
import { isUuid } from "../../../../../server/utils/validators";

async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const rawId = req.query?.id;
  const listingId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!isUuid(listingId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "listing id must be a UUID"));
  }

  try {
    const ownerId = ctx?.ownerId || null;
    const agentId = ctx?.agentId || null;
    const thread = await createThread({ listingId, ownerId, agentId });
    return jsonResponse(201, { data: thread });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
