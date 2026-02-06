import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors.js";
import { isUuid } from "../../../../server/utils/validators";
import { parseWatchlistCriteria } from "../../../../server/utils/watchlists";
import {
  deleteWatchlistForAgent,
  getWatchlistForAgent,
  updateWatchlistForAgent
} from "../../../../server/services/watchlists";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function mapWatchlistRow(row) {
  if (!row) return null;
  return {
    watchlist_id: row.watchlist_id,
    agent_id: row.agent_id,
    name: row.name,
    active: row.active,
    criteria: row.criteria,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_matched_at: null
  };
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "PATCH" && req.method !== "DELETE") {
    return methodNotAllowed(["GET", "PATCH", "DELETE"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const rawId = resolveParam(req.query?.watchlist_id);
  const watchlistId = rawId ? String(rawId) : null;
  if (!isUuid(watchlistId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "watchlist_id must be a UUID"));
  }

  if (req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "watchlist.get";
    }

    try {
      const watchlist = await getWatchlistForAgent({
        watchlistId,
        agentId: ctx.agentId
      });
      if (!watchlist) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Watchlist not found"));
      }
      return jsonResponse(200, mapWatchlistRow(watchlist));
    } catch (error) {
      if (ctx && error?.isBlocked) {
        ctx.outcome = { type: "BLOCKED", reason: error.reason || "watchlists" };
      }
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  if (req.method === "PATCH") {
    if (ctx) {
      ctx.auditEvent = "watchlist.updated";
    }

    const { name, criteria: rawCriteria, active: rawActive } = req.body || {};
    const patch = {};

    if (name !== undefined) {
      if (name === null) {
        patch.name = null;
      } else {
        if (typeof name !== "string") {
          return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name must be a string"));
        }
        const trimmed = name.trim();
        if (trimmed) {
          if (trimmed.length > 80) {
            return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name must be at most 80 characters"));
          }
          patch.name = trimmed;
        } else {
          patch.name = null;
        }
      }
    }

    if (rawActive !== undefined) {
      if (typeof rawActive !== "boolean") {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "active must be a boolean"));
      }
      patch.active = rawActive;
    }

    if (rawCriteria !== undefined) {
      try {
        const parsed = parseWatchlistCriteria(rawCriteria);
        patch.criteria = parsed.criteria;
        patch.queryText = parsed.queryText;
        patch.tags = parsed.tags;
        patch.priceMax = parsed.priceMax;
        patch.geoLat = parsed.geoLat;
        patch.geoLon = parsed.geoLon;
        patch.distanceKm = parsed.distanceKm;
      } catch (error) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", error.message));
      }
    }

    if (Object.keys(patch).length === 0) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "At least one field is required"));
    }

    try {
      const updated = await updateWatchlistForAgent({
        watchlistId,
        agentId: ctx.agentId,
        patch
      });
      if (!updated) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Watchlist not found"));
      }
      return jsonResponse(200, mapWatchlistRow(updated));
    } catch (error) {
      if (ctx && error?.isBlocked) {
        ctx.outcome = { type: "BLOCKED", reason: error.reason || "watchlists" };
      }
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  if (ctx) {
    ctx.auditEvent = "watchlist.deleted";
  }

  try {
    const deleted = await deleteWatchlistForAgent({
      watchlistId,
      agentId: ctx.agentId
    });
    if (!deleted) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Watchlist not found"));
    }
    return jsonResponse(200, { watchlist_id: watchlistId, deleted: true });
  } catch (error) {
    if (ctx && error?.isBlocked) {
      ctx.outcome = { type: "BLOCKED", reason: error.reason || "watchlists" };
    }
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);

