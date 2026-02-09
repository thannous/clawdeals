import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getWatchlistForAgent } from "../../../../../server/services/watchlists";
import {
  decodeWatchlistMatchesCursor,
  hydrateDealSummaries,
  hydrateListingSummaries,
  listWatchlistMatches
} from "../../../../../server/services/watchlist-matches";
import { WATCHLIST_MATCHES_DEFAULT_LIMIT, WATCHLIST_MATCHES_MAX_LIMIT } from "../../../../../server/config/watchlists";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseIntegerQueryParam(raw, name) {
  if (raw === undefined || raw === null || raw === "") return null;
  const asString = typeof raw === "string" ? raw : String(raw);
  const trimmed = asString.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw new Error(`${name} must be an integer`);
  }
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`${name} must be an integer`);
  }
  return n;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  if (ctx) {
    ctx.auditEvent = "watchlist.matches.listed";
  }

  const rawId = resolveParam(req.query?.watchlist_id);
  const watchlistId = rawId ? String(rawId) : null;
  if (!isUuid(watchlistId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "watchlist_id must be a UUID"));
  }

  const rawEntityType = resolveParam(req.query?.entity_type);
  const entityType = rawEntityType ? String(rawEntityType).trim().toLowerCase() : null;
  if (entityType !== "deal" && entityType !== "listing") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "entity_type must be 'deal' or 'listing'"));
  }

  const rawLimit = resolveParam(req.query?.limit);
  let limit = WATCHLIST_MATCHES_DEFAULT_LIMIT;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== "") {
    let parsed;
    try {
      parsed = parseIntegerQueryParam(rawLimit, "limit");
    } catch (error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
    }
    if (parsed < 1 || parsed > WATCHLIST_MATCHES_MAX_LIMIT) {
      return jsonResponse(
        400,
        errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${WATCHLIST_MATCHES_MAX_LIMIT}`)
      );
    }
    limit = parsed;
  }

  const rawCursor = resolveParam(req.query?.cursor);
  let cursor = null;
  if (rawCursor) {
    const parsed = decodeWatchlistMatchesCursor(String(rawCursor));
    if (parsed?.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
    }
    cursor = parsed?.value || null;
  }

  try {
    const watchlist = await getWatchlistForAgent({
      watchlistId,
      agentId: ctx.agentId
    });
    if (!watchlist) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Watchlist not found"));
    }

    const result = await listWatchlistMatches({
      watchlistId,
      entityType,
      limit,
      cursor
    });

    const items = Array.isArray(result.items) ? result.items : [];
    const entityIds = Array.from(new Set(items.map((row) => row.entity_id).filter(Boolean)));
    const dealsById = entityType === "deal" ? await hydrateDealSummaries({ dealIds: entityIds }) : new Map();
    const listingsById = entityType === "listing" ? await hydrateListingSummaries({ listingIds: entityIds }) : new Map();

    const responseItems = items.map((row) => {
      const dealSummary =
        entityType === "deal"
          ? (() => {
              const summary = row.entity_id ? dealsById.get(row.entity_id) || null : null;
              return summary
                ? {
                    deal_id: summary.deal_id,
                    title: summary.title,
                    price: toNumber(summary.price),
                    currency: summary.currency,
                    expires_at: summary.expires_at,
                    tags: summary.tags || [],
                    status: summary.status,
                    created_at: summary.created_at
                  }
                : null;
            })()
          : null;

      const listingSummary =
        entityType === "listing"
          ? (() => {
              const summary = row.entity_id ? listingsById.get(row.entity_id) || null : null;
              return summary
                ? {
                    listing_id: summary.listing_id,
                    title: summary.title,
                    category: summary.category,
                    condition: summary.condition,
                    price: {
                      amount: toNumber(summary.price_amount),
                      currency: summary.currency
                    },
                    status: summary.status,
                    created_at: summary.created_at
                  }
                : null;
            })()
          : null;

      return {
        watchlist_match_id: row.watchlist_match_id,
        watchlist_id: row.watchlist_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        matched_at: row.matched_at,
        reason: row.reason || null,
        deal_summary: dealSummary,
        listing_summary: listingSummary
      };
    });

    return jsonResponse(200, {
      items: responseItems,
      next_cursor: result.nextCursor
    });
  } catch (error) {
    if (ctx && error?.isBlocked) {
      ctx.outcome = { type: "BLOCKED", reason: error.reason || "watchlists" };
    }
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
