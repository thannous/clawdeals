import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors.js";
import { normalizeEmail } from "../../../server/utils/owner-verification";
import { createWatchlistSignup } from "../../../server/services/watchlist-signups";

async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const { email, locale, source } = req.body || {};
  if (email === null || email === undefined) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "email is required"));
  }
  if (typeof email !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "email must be a string"));
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "email is invalid"));
  }

  try {
    const result = await createWatchlistSignup({
      email: normalizedEmail,
      locale,
      source
    });
    return jsonResponse(result.status === "already_registered" ? 200 : 201, {
      data: {
        status: result.status
      }
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "watchlists.write"
});
