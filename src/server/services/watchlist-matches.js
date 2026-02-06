import { getSupabaseServiceClient } from "../db/supabase";
import { WATCHLIST_MATCHES_DEFAULT_LIMIT, WATCHLIST_MATCHES_MAX_LIMIT } from "../config/watchlists";
import { mapSupabaseError } from "./supabase-errors";

function buildServiceError(message, status = 500, code = "ERROR") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

function formatFilterValue(value) {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/"/g, "\\\"")}"`;
}

export function encodeWatchlistMatchesCursor(cursor) {
  if (!cursor) return null;
  const payload = JSON.stringify({
    matched_at: cursor.matched_at,
    watchlist_match_id: cursor.watchlist_match_id
  });
  return Buffer.from(payload, "utf8").toString("base64");
}

export function decodeWatchlistMatchesCursor(raw) {
  if (!raw || typeof raw !== "string") return null;
  let decoded;
  try {
    decoded = Buffer.from(raw, "base64").toString("utf8");
  } catch (error) {
    return { error: "Invalid cursor" };
  }
  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    return { error: "Invalid cursor" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { error: "Invalid cursor" };
  }
  if (typeof parsed.matched_at !== "string" || typeof parsed.watchlist_match_id !== "string") {
    return { error: "Invalid cursor" };
  }
  return {
    value: {
      matched_at: parsed.matched_at,
      watchlist_match_id: parsed.watchlist_match_id
    }
  };
}

export async function listWatchlistMatches({ watchlistId, entityType = "deal", limit, cursor } = {}) {
  if (!watchlistId || typeof watchlistId !== "string") {
    throw buildServiceError("watchlistId is required", 400, "VALIDATION_ERROR");
  }

  const pageLimit = typeof limit === "number" ? limit : WATCHLIST_MATCHES_DEFAULT_LIMIT;
  const cappedLimit = Math.max(1, Math.min(WATCHLIST_MATCHES_MAX_LIMIT, pageLimit));

  const client = getSupabaseServiceClient();
  let query = client
    .from("watchlist_matches")
    .select("watchlist_match_id,watchlist_id,agent_id,entity_type,entity_id,matched_at,reason")
    .eq("watchlist_id", watchlistId)
    .eq("entity_type", entityType)
    .order("matched_at", { ascending: false })
    .order("watchlist_match_id", { ascending: false })
    .limit(cappedLimit + 1);

  if (cursor?.matched_at && cursor?.watchlist_match_id) {
    const matchedAt = formatFilterValue(cursor.matched_at);
    const matchId = formatFilterValue(cursor.watchlist_match_id);
    query = query.or(
      `matched_at.lt.${matchedAt},and(matched_at.eq.${matchedAt},watchlist_match_id.lt.${matchId})`
    );
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const rows = Array.isArray(data) ? data : [];
  const hasMore = rows.length > cappedLimit;
  const items = hasMore ? rows.slice(0, cappedLimit) : rows;
  const nextCursor = hasMore
    ? encodeWatchlistMatchesCursor({
        matched_at: items[items.length - 1].matched_at,
        watchlist_match_id: items[items.length - 1].watchlist_match_id
      })
    : null;

  return { items, nextCursor };
}

export async function hydrateDealSummaries({ dealIds } = {}) {
  const ids = Array.isArray(dealIds) ? dealIds.filter(Boolean) : [];
  if (ids.length === 0) return new Map();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("deals")
    .select("deal_id,title,price,currency,expires_at,tags,status,created_at")
    .in("deal_id", ids);

  if (error) {
    mapError(error);
  }

  const map = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    if (!row?.deal_id) continue;
    map.set(row.deal_id, row);
  }
  return map;
}

