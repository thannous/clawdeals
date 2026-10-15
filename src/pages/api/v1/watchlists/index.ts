import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import {
  decodeWatchlistCursor,
  listWatchlists,
  WATCHLISTS_DEFAULT_LIMIT,
  WATCHLISTS_MAX_LIMIT
} from "../../../../server/services/watchlists";
import { createConfiguredWatchlist, mapWatchlistResponse, parseWatchlistCreation } from "../../../../server/services/watchlist-creation";

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
        items: (result.items || []).map(mapWatchlistResponse),
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

  try {
    const input = parseWatchlistCreation(req.body);
    const created = await createConfiguredWatchlist({ agentId: ctx.agentId, input });

    return jsonResponse(201, mapWatchlistResponse(created));
  } catch (error) {
    if (ctx && error?.isBlocked) {
      ctx.outcome = { type: "BLOCKED", reason: error.reason || "watchlists" };
    }
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
