import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { injectConsoleOpsOwner } from "../../../server/middleware/console-ops-identity";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { listListings } from "../../../server/services/listings";
import { decodeListingsCursor } from "../../../server/services/listings-cursor";
import { redactEmailsAndPhones } from "../../../server/utils/free-text-redaction";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx) {
    ctx.auditEvent = "listings.listed";
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const sortRaw = resolveParam(req.query?.sort);
  const sort = sortRaw ? String(sortRaw).toLowerCase() : "recent";
  if (sort !== "recent" && sort !== "price_asc" && sort !== "price_desc" && sort !== "rank") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "sort must be one of: recent, price_asc, price_desc, rank"));
  }

  const limitRaw = resolveParam(req.query?.limit);
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== undefined && limitRaw !== null && limitRaw !== "") {
    const parsed = Number.parseInt(String(limitRaw), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > MAX_LIMIT) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${MAX_LIMIT}`));
    }
    limit = parsed;
  }

  const cursorRaw = resolveParam(req.query?.cursor);
  let cursor = null;
  if (cursorRaw) {
    const parsed = decodeListingsCursor(cursorRaw);
    if (parsed?.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
    }
    cursor = parsed?.value || null;
  }

  const priceMinRaw = resolveParam(req.query?.price_min);
  let priceMin;
  if (priceMinRaw !== undefined && priceMinRaw !== null && priceMinRaw !== "") {
    priceMin = Number(priceMinRaw);
    if (!Number.isFinite(priceMin)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "price_min must be a number"));
    }
  }

  const priceMaxRaw = resolveParam(req.query?.price_max);
  let priceMax;
  if (priceMaxRaw !== undefined && priceMaxRaw !== null && priceMaxRaw !== "") {
    priceMax = Number(priceMaxRaw);
    if (!Number.isFinite(priceMax)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "price_max must be a number"));
    }
  }

  const q = resolveParam(req.query?.q) || null;
  const category = resolveParam(req.query?.category) || null;
  const condition = resolveParam(req.query?.condition) || null;
  const status = resolveParam(req.query?.status) || null;

  try {
    const result = await listListings({
      q,
      category,
      condition,
      status,
      priceMin,
      priceMax,
      sort,
      limit,
      cursor,
      includeHidden: true
    });

    const items = (result.items || []).map((item: any) => {
      if (!item || typeof item !== "object") {
        return item;
      }
      if (typeof item.title === "string") {
        const redacted = redactEmailsAndPhones(item.title);
        return { ...item, title: redacted.text, title_redacted: redacted.redacted };
      }
      return { ...item, title_redacted: false };
    });

    return jsonResponse(200, { items, next_cursor: result.nextCursor });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default injectConsoleOpsOwner(withApiMiddlewares(handler, { routeGroup: "listings.read" }));
