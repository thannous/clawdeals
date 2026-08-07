import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { normalizeEmail } from "../../../../server/utils/owner-verification";
import { isEmailAddress } from "../../../../server/utils/validators";
import { parseWatchlistCriteria } from "../../../../server/utils/watchlists";
import { MARKET_CURRENCY, resolveMarketCode } from "../../../../server/config/markets";
import { createEmailAlert } from "../../../../server/services/email-alerts";

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const { email, locale, name, criteria: rawCriteria, market_code: rawMarketCode } = req.body || {};

  if (typeof email !== "string" || !email.trim()) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "email is required"));
  }
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !isEmailAddress(normalizedEmail)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "email is invalid"));
  }

  let normalizedName = null;
  if (name !== undefined && name !== null) {
    if (typeof name !== "string") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name must be a string"));
    }
    const trimmed = name.trim();
    if (trimmed.length > 80) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name must be at most 80 characters"));
    }
    normalizedName = trimmed || null;
  }

  let criteria;
  try {
    criteria = parseWatchlistCriteria(rawCriteria);
  } catch (error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
  }

  let marketCode;
  try {
    marketCode = resolveMarketCode({ marketCode: rawMarketCode, currency: "EUR" });
  } catch (error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
  }

  if (ctx) {
    ctx.auditEvent = "alert.requested";
    // Never put the raw email in the audit payload.
    ctx.body = { market_code: marketCode, has_query: Boolean(criteria.queryText), tags: criteria.tags || [] };
  }

  try {
    const result = await createEmailAlert({
      email: normalizedEmail,
      locale,
      name: normalizedName,
      marketCode,
      currency: MARKET_CURRENCY[marketCode],
      criteria: criteria.criteria,
      queryText: criteria.queryText,
      tags: criteria.tags,
      priceMax: criteria.priceMax,
      geoLat: criteria.geoLat,
      geoLon: criteria.geoLon,
      distanceKm: criteria.distanceKm
    });

    return jsonResponse(202, { data: result }, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "alerts.write_ip"
});
