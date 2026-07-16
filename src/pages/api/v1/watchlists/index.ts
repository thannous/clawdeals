import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { parseWatchlistCriteria } from "../../../../server/utils/watchlists";
import {
  createWatchlist,
  decodeWatchlistCursor,
  listWatchlists,
  WATCHLISTS_DEFAULT_LIMIT,
  WATCHLISTS_MAX_LIMIT
} from "../../../../server/services/watchlists";
import { enqueueWatchlistBackfill } from "../../../../server/services/watchlist-backfill-queue";
import { MARKET_CURRENCY, resolveMarketCode } from "../../../../server/config/markets";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseBooleanQueryParam(raw, name) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new Error(`${name} must be a boolean`);
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be true or false`);
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

function mapWatchlistRow(row) {
  if (!row) return null;
  return {
    watchlist_id: row.watchlist_id,
    agent_id: row.agent_id,
    name: row.name,
    active: row.active,
    market_code: row.market_code,
    currency: row.currency,
    criteria: row.criteria,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_matched_at: null
  };
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "POST") {
    return methodNotAllowed(["GET", "POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  if (req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "watchlists.listed";
    }

    const rawActive = resolveParam(req.query?.active);
    let active = true;
    if (rawActive !== undefined && rawActive !== null && rawActive !== "") {
      try {
        active = parseBooleanQueryParam(String(rawActive), "active");
      } catch (error) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
      }
    }

    const rawLimit = resolveParam(req.query?.limit);
    let limit = WATCHLISTS_DEFAULT_LIMIT;
    if (rawLimit !== undefined && rawLimit !== null && rawLimit !== "") {
      let parsed;
      try {
        parsed = parseIntegerQueryParam(rawLimit, "limit");
      } catch (error) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
      }
      if (parsed < 1 || parsed > WATCHLISTS_MAX_LIMIT) {
        return jsonResponse(
          400,
          errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${WATCHLISTS_MAX_LIMIT}`)
        );
      }
      limit = parsed;
    }

    const rawCursor = resolveParam(req.query?.cursor);
    let cursor = null;
    if (rawCursor) {
      const parsed = decodeWatchlistCursor(String(rawCursor));
      if (parsed?.error) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
      }
      cursor = parsed?.value || null;
    }

    try {
      const result = await listWatchlists({
        agentId: ctx.agentId,
        active,
        limit,
        cursor
      });

      return jsonResponse(200, {
        items: (result.items || []).map(mapWatchlistRow),
        next_cursor: result.nextCursor
      });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  if (ctx) {
    ctx.auditEvent = "watchlist.created";
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const { name, criteria: rawCriteria, active: rawActive, market_code: rawMarketCode } = req.body || {};

  let normalizedName = null;
  if (name !== undefined && name !== null) {
    if (typeof name !== "string") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name must be a string"));
    }
    const trimmed = name.trim();
    if (trimmed) {
      if (trimmed.length > 80) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name must be at most 80 characters"));
      }
      normalizedName = trimmed;
    }
  }

  let active = true;
  if (rawActive !== undefined && rawActive !== null) {
    if (typeof rawActive !== "boolean") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "active must be a boolean"));
    }
    active = rawActive;
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

  try {
    const created = await createWatchlist({
      agentId: ctx.agentId,
      name: normalizedName,
      active,
      criteria: criteria.criteria,
      queryText: criteria.queryText,
      tags: criteria.tags,
      priceMax: criteria.priceMax,
      marketCode,
      currency: MARKET_CURRENCY[marketCode],
      geoLat: criteria.geoLat,
      geoLon: criteria.geoLon,
      distanceKm: criteria.distanceKm
    });

    try {
      await enqueueWatchlistBackfill({ watchlistId: created.watchlist_id });
    } catch (error) {
      // Best-effort: watchlist creation should not fail if the async backfill queue is unavailable.
      console.info("watchlist.backfill_enqueue_failed", {
        watchlist_id: created.watchlist_id,
        error: error?.message || String(error)
      });
    }

    return jsonResponse(201, mapWatchlistRow(created));
  } catch (error) {
    if (ctx && error?.isBlocked) {
      ctx.outcome = { type: "BLOCKED", reason: error.reason || "watchlists" };
    }
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
