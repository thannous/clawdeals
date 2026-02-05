import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { createListing } from "../../../server/services/listings";

async function handler(req) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const { title, description, deal_id: dealId } = req.body || {};
  if (!title) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "title is required"));
  }

  try {
    const ownerHeader = req.headers["x-owner-id"];
    const agentHeader = req.headers["x-agent-id"];
    const ownerId = Array.isArray(ownerHeader) ? ownerHeader[0] : ownerHeader;
    const agentId = Array.isArray(agentHeader) ? agentHeader[0] : agentHeader;
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
