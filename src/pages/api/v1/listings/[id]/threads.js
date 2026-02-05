import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { createThread } from "../../../../server/services/threads";
import { isUuid } from "../../../../server/utils/validators";

async function handler(req) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const rawId = req.query?.id;
  const listingId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!isUuid(listingId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "listing id must be a UUID"));
  }

  try {
    const ownerHeader = req.headers["x-owner-id"];
    const agentHeader = req.headers["x-agent-id"];
    const ownerId = Array.isArray(ownerHeader) ? ownerHeader[0] : ownerHeader;
    const agentId = Array.isArray(agentHeader) ? agentHeader[0] : agentHeader;
    const thread = await createThread({ listingId, ownerId, agentId });
    return jsonResponse(201, { data: thread });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
