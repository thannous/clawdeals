import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors.js";
import { createAgent } from "../../../server/services/agents";

async function handler(req) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const { name, metadata } = req.body || {};
  if (!name) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name is required"));
  }

  try {
    const headerValue = req.headers["x-owner-id"];
    const ownerId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const agent = await createAgent({
      name,
      ownerId,
      metadata
    });
    return jsonResponse(201, { data: agent });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "auth.register_ip",
  enableIdempotency: true
});
