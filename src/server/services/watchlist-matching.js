import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { publishSseEvent } from "../sse/store";
import { rateLimitMiddleware } from "../rate-limit/middleware";
import { MAX_MATCHES_PER_DEAL, WATCHLIST_MATCH_EVENT_MAX_IDS } from "../config/watchlists";
import { buildEntityTokensFromDeal, evaluateWatchlistMatch } from "../utils/matching";

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

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t) => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function fetchCandidateWatchlists({ deal, client }) {
  const select =
    "watchlist_id,agent_id,active,query_text,tags,price_max,geo_lat,geo_lon,distance_km,criteria,deleted_at";

  const baseQuery = () =>
    client
      .from("watchlists")
      .select(select)
      .eq("active", true)
      .is("deleted_at", null)
      // Deals have no geo in v0; avoid pulling watchlists that can never match.
      .is("geo_lat", null)
      .is("geo_lon", null);

  const dealTags = normalizeTags(deal?.tags);
  const dealPrice = toNumber(deal?.price);
  const dealCurrency = typeof deal?.currency === "string" ? deal.currency.trim().toUpperCase() : null;

  const queries = [];

  if (dealTags.length > 0) {
    // Supabase-js query builders are mutable; build a fresh query each time.
    queries.push(baseQuery().overlaps("tags", dealTags).limit(5000));
  }

  // Any watchlist with a query is a candidate (query match happens in memory).
  queries.push(baseQuery().not("query_text", "is", null).limit(5000));

  // Price-only watchlists (or query+price) need to be considered too.
  if (dealCurrency === "EUR" && Number.isFinite(dealPrice)) {
    queries.push(baseQuery().gte("price_max", dealPrice).limit(5000));
  }

  const results = await Promise.all(
    queries.map(async (q) => {
      const { data, error } = await q;
      if (error) mapError(error);
      return Array.isArray(data) ? data : [];
    })
  );

  const unique = new Map();
  for (const list of results) {
    for (const row of list) {
      if (!row?.watchlist_id) continue;
      if (!unique.has(row.watchlist_id)) unique.set(row.watchlist_id, row);
    }
  }

  return Array.from(unique.values());
}

async function upsertMatches({ client, rows }) {
  const { data, error } = await client
    .from("watchlist_matches")
    .upsert(rows, {
      onConflict: "watchlist_id,entity_type,entity_id",
      ignoreDuplicates: true
    })
    .select("watchlist_match_id,watchlist_id,agent_id");

  if (error) {
    mapError(error);
  }

  return Array.isArray(data) ? data : [];
}

async function markDelivered({ client, matchIds, deliveredAt }) {
  if (!matchIds.length) return;
  const { error } = await client
    .from("watchlist_matches")
    .update({ delivered_at: deliveredAt })
    .in("watchlist_match_id", matchIds);
  if (error) {
    console.info("watchlist.match_delivered_at_update_failed", { error: error.message || String(error) });
  }
}

async function shouldSendSseForAgent({ agentId }) {
  try {
    const result = await rateLimitMiddleware(null, {
      routeGroup: "watchlist.match",
      agentId,
      env: process.env,
      limitMultiplier: 1
    });
    if (result && result.status === 429) return false;
  } catch (error) {
    // Fail-open.
  }
  return true;
}

export async function matchDealToWatchlists({ deal, now = new Date(), client } = {}) {
  if (!deal || typeof deal !== "object") {
    throw buildServiceError("deal is required", 400, "VALIDATION_ERROR");
  }
  if (!deal.deal_id) {
    throw buildServiceError("deal.deal_id is required", 400, "VALIDATION_ERROR");
  }

  const supabase = client || getSupabaseServiceClient();
  const entityTokens = buildEntityTokensFromDeal(deal);

  const candidates = await fetchCandidateWatchlists({ deal, client: supabase });
  if (candidates.length === 0) {
    return { ok: true, candidates_count: 0, matched_count: 0, inserted_count: 0 };
  }

  const matches = [];
  for (const watchlist of candidates) {
    const evaluated = evaluateWatchlistMatch({ deal, watchlist, entityTokens });
    if (evaluated.matched) {
      matches.push({
        watchlist,
        reason: evaluated.reason
      });
      if (matches.length > MAX_MATCHES_PER_DEAL) {
        console.info("watchlist.match_overflow", {
          deal_id: deal.deal_id,
          max_matches_per_deal: MAX_MATCHES_PER_DEAL
        });
        return { ok: false, reason: "overflow", candidates_count: candidates.length, matched_count: matches.length };
      }
    }
  }

  if (matches.length === 0) {
    return { ok: true, candidates_count: candidates.length, matched_count: 0, inserted_count: 0 };
  }

  const matchedAt = now.toISOString();

  const rows = matches.map(({ watchlist, reason }) => ({
    watchlist_id: watchlist.watchlist_id,
    agent_id: watchlist.agent_id,
    entity_type: "deal",
    entity_id: deal.deal_id,
    matched_at: matchedAt,
    reason: reason && typeof reason === "object" && Object.keys(reason).length > 0 ? reason : null
  }));

  const inserted = await upsertMatches({ client: supabase, rows });

  if (inserted.length === 0) {
    console.info("watchlist.match.duplicate_suppressed", { deal_id: deal.deal_id });
    return {
      ok: true,
      candidates_count: candidates.length,
      matched_count: matches.length,
      inserted_count: 0
    };
  }

  const insertedByAgent = new Map();
  for (const row of inserted) {
    const agentId = row.agent_id;
    if (!agentId) continue;
    const state = insertedByAgent.get(agentId) || { watchlistIds: [], matchIds: [] };
    if (row.watchlist_id) state.watchlistIds.push(row.watchlist_id);
    if (row.watchlist_match_id) state.matchIds.push(row.watchlist_match_id);
    insertedByAgent.set(agentId, state);
  }

  const deliveredAt = new Date().toISOString();

  for (const [agentId, state] of insertedByAgent.entries()) {
    const canSend = await shouldSendSseForAgent({ agentId });
    if (!canSend) {
      console.info("watchlist.match.rate_limited", { agent_id: agentId, deal_id: deal.deal_id });
      continue;
    }

    const allIds = Array.from(new Set(state.watchlistIds));
    const watchlistIds = allIds.slice(0, WATCHLIST_MATCH_EVENT_MAX_IDS);
    const watchlistIdsTruncated = allIds.length > WATCHLIST_MATCH_EVENT_MAX_IDS;

    const result = await publishSseEvent({
      audienceType: "agent",
      audienceId: agentId,
      type: "watchlist.match",
      entity: { type: "deal", id: deal.deal_id },
      payload: {
        deal_id: deal.deal_id,
        watchlist_ids: watchlistIds,
        watchlist_ids_truncated: watchlistIdsTruncated
      },
      ts: matchedAt
    });

    if (result?.ok) {
      await markDelivered({ client: supabase, matchIds: state.matchIds, deliveredAt });
    } else {
      console.info("watchlist.match_sse_failed", { agent_id: agentId, deal_id: deal.deal_id, result });
    }
  }

  return {
    ok: true,
    candidates_count: candidates.length,
    matched_count: matches.length,
    inserted_count: inserted.length
  };
}
