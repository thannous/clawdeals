import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const MAX_ACTIVE_WATCHLISTS = 50;

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(raw: string) {
  // Normalize:
  // - Some tooling decodes '+' as space in query strings.
  // - Accept both base64url and legacy base64.
  let normalized = raw.trim().replace(/ /g, "+");
  normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");

  // Pad to a multiple of 4.
  const padLen = normalized.length % 4;
  if (padLen === 2) normalized += "==";
  else if (padLen === 3) normalized += "=";
  else if (padLen !== 0) {
    throw new Error("invalid_base64");
  }

  return Buffer.from(normalized, "base64").toString("utf8");
}

export function encodeWatchlistCursor(cursor) {
  if (!cursor) return null;
  const payload = JSON.stringify({
    created_at: cursor.created_at,
    watchlist_id: cursor.watchlist_id
  });
  return base64UrlEncode(payload);
}

export function decodeWatchlistCursor(raw) {
  if (!raw || typeof raw !== "string") return null;
  let decoded;
  try {
    decoded = base64UrlDecode(raw);
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
  if (typeof parsed.created_at !== "string" || typeof parsed.watchlist_id !== "string") {
    return { error: "Invalid cursor" };
  }
  return {
    value: {
      created_at: parsed.created_at,
      watchlist_id: parsed.watchlist_id
    }
  };
}

function formatFilterValue(value) {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/"/g, "\\\"")}"`;
}

function buildServiceError(message, status = 500, code = "ERROR", meta?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (meta && typeof meta === "object") {
    Object.assign(error, meta);
  }
  return error;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

async function countActiveWatchlists(agentId) {
  const client = getSupabaseServiceClient();
  const { count, error } = await client
    .from("watchlists")
    .select("watchlist_id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("active", true)
    .is("deleted_at", null);
  if (error) {
    mapError(error);
  }
  return typeof count === "number" ? count : 0;
}

async function getWatchlistById(watchlistId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("watchlists")
    .select("*")
    .eq("watchlist_id", watchlistId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function createWatchlist({
  agentId,
  name,
  active,
  criteria,
  queryText,
  tags,
  priceMax,
  geoLat,
  geoLon,
  distanceKm
}) {
  if (!agentId) {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }

  if (active === true) {
    const activeCount = await countActiveWatchlists(agentId);
    if (activeCount >= MAX_ACTIVE_WATCHLISTS) {
      throw buildServiceError(
        "Watchlist limit reached",
        409,
        "WATCHLIST_LIMIT_REACHED",
        { isBlocked: true, reason: "quota", activeLimit: MAX_ACTIVE_WATCHLISTS }
      );
    }
  }

  const nowIso = new Date().toISOString();
  const client = getSupabaseServiceClient();
  const payload = {
    agent_id: agentId,
    name: name || null,
    active: active !== false,
    criteria: criteria || {},
    query_text: queryText || null,
    tags: tags || [],
    price_max: priceMax ?? null,
    geo_lat: geoLat ?? null,
    geo_lon: geoLon ?? null,
    distance_km: distanceKm ?? null,
    updated_at: nowIso
  };

  const { data, error } = await client.from("watchlists").insert(payload).select("*").single();
  if (error) {
    mapError(error);
  }
  return data;
}

export async function listWatchlists({ agentId, active, limit, cursor }: any = {}) {
  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? DEFAULT_LIMIT;
  let query = client
    .from("watchlists")
    .select("*")
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("watchlist_id", { ascending: false })
    .limit(pageLimit + 1);

  if (typeof active === "boolean") {
    query = query.eq("active", active);
  }

  if (cursor?.created_at && cursor?.watchlist_id) {
    const createdAt = formatFilterValue(cursor.created_at);
    const watchlistId = formatFilterValue(cursor.watchlist_id);
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},watchlist_id.lt.${watchlistId})`
    );
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const watchlists = data || [];
  const hasMore = watchlists.length > pageLimit;
  const items = hasMore ? watchlists.slice(0, pageLimit) : watchlists;
  const nextCursor = hasMore
    ? encodeWatchlistCursor({
        created_at: items[items.length - 1].created_at,
        watchlist_id: items[items.length - 1].watchlist_id
      })
    : null;

  return { items, nextCursor };
}

export async function listWatchlistsPage({
  agentId,
  active,
  page = 0,
  pageSize = 10
}: {
  agentId: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}) {
  if (!agentId) {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }

  const resolvedSize = Math.max(1, Math.min(100, Number.isInteger(pageSize) ? pageSize : 10));
  const resolvedPage = Math.max(0, Number.isInteger(page) ? page : 0);
  const offset = resolvedPage * resolvedSize;

  const client = getSupabaseServiceClient();
  let query = client
    .from("watchlists")
    .select("*")
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("watchlist_id", { ascending: false })
    .range(offset, offset + resolvedSize); // inclusive; fetch one extra to detect next page

  if (typeof active === "boolean") {
    query = query.eq("active", active);
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const rows = data || [];
  const hasMore = rows.length > resolvedSize;
  const items = hasMore ? rows.slice(0, resolvedSize) : rows;

  return {
    items,
    page: resolvedPage,
    pageSize: resolvedSize,
    hasPrev: resolvedPage > 0,
    hasNext: hasMore
  };
}

export async function getWatchlistForAgent({ watchlistId, agentId }: any = {}) {
  const record = await getWatchlistById(watchlistId);
  if (!record) return null;
  if (record.agent_id !== agentId) {
    throw buildServiceError("Watchlist not found", 404, "NOT_FOUND", {
      isBlocked: true,
      reason: "authz"
    });
  }
  return record;
}

export async function updateWatchlistForAgent({ watchlistId, agentId, patch }: any = {}) {
  const existing = await getWatchlistById(watchlistId);
  if (!existing) return null;
  if (existing.agent_id !== agentId) {
    throw buildServiceError("Watchlist not found", 404, "NOT_FOUND", {
      isBlocked: true,
      reason: "authz"
    });
  }

  const nextActive = typeof patch?.active === "boolean" ? patch.active : existing.active;
  if (nextActive === true && existing.active === false) {
    const activeCount = await countActiveWatchlists(agentId);
    if (activeCount >= MAX_ACTIVE_WATCHLISTS) {
      throw buildServiceError(
        "Watchlist limit reached",
        409,
        "WATCHLIST_LIMIT_REACHED",
        { isBlocked: true, reason: "quota", activeLimit: MAX_ACTIVE_WATCHLISTS }
      );
    }
  }

  const nowIso = new Date().toISOString();
  const payload: any = {
    updated_at: nowIso
  };

  if (patch && Object.prototype.hasOwnProperty.call(patch, "name")) {
    payload.name = patch.name || null;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, "active")) {
    payload.active = patch.active;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, "criteria")) {
    payload.criteria = patch.criteria;
    payload.query_text = patch.queryText ?? null;
    payload.tags = patch.tags ?? [];
    payload.price_max = patch.priceMax ?? null;
    payload.geo_lat = patch.geoLat ?? null;
    payload.geo_lon = patch.geoLon ?? null;
    payload.distance_km = patch.distanceKm ?? null;
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("watchlists")
    .update(payload)
    .eq("watchlist_id", watchlistId)
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function deleteWatchlistForAgent({ watchlistId, agentId, deletedAt }: any = {}) {
  const existing = await getWatchlistById(watchlistId);
  if (!existing) return null;
  if (existing.agent_id !== agentId) {
    throw buildServiceError("Watchlist not found", 404, "NOT_FOUND", {
      isBlocked: true,
      reason: "authz"
    });
  }

  const now = deletedAt instanceof Date ? deletedAt : new Date();
  const nowIso = now.toISOString();

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("watchlists")
    .update({
      active: false,
      deleted_at: nowIso,
      updated_at: nowIso
    })
    .eq("watchlist_id", watchlistId)
    .eq("agent_id", agentId)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    mapError(error);
  }
  return data || null;
}

export { MAX_LIMIT as WATCHLISTS_MAX_LIMIT, DEFAULT_LIMIT as WATCHLISTS_DEFAULT_LIMIT, MAX_ACTIVE_WATCHLISTS };
