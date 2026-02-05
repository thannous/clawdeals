import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { createPolicy, listPolicies } from "../../../server/services/policies";

async function handler(req) {
  if (req.method === "GET") {
    try {
      const policies = await listPolicies();
      return jsonResponse(200, { data: policies });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  if (req.method === "PUT") {
    const { name, body, status } = req.body || {};
    if (!name) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name is required"));
    }

    try {
      const policy = await createPolicy({ name, status: status || "active", body });
      return jsonResponse(200, { data: policy });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  return methodNotAllowed(["GET", "PUT"]);
}

export default withApiMiddlewares(handler);
