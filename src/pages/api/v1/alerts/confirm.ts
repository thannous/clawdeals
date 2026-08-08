import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { confirmEmailAlert } from "../../../../server/services/email-alerts";
import { getPublicLandingUrl } from "../../../../shared/urls";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const token = resolveParam(req.query?.token);
  if (typeof token !== "string" || !token.trim()) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "token is required"));
  }

  if (ctx) {
    ctx.auditEvent = "alert.confirmed";
  }

  try {
    const result = await confirmEmailAlert({ token: token.trim() });
    // The link is opened in a browser: land the user on the marketing site.
    return jsonResponse(302, { data: result }, { Location: `${getPublicLandingUrl()}/?alert=confirmed` });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "alerts.confirm_ip",
  enableIdempotency: false
});
