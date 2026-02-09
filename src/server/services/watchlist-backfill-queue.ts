import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { buildEntityTokensFromDeal, evaluateWatchlistMatch, buildEntityTokensFromListing, evaluateWatchlistMatchListing } from "../utils/matching";

function buildServiceError(message, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

function toPositiveInt(value: any, fallback: number) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export async function enqueueWatchlistBackfill({ watchlistId, now = new Date(), client }: any = {}) {
  if (!watchlistId || typeof watchlistId !== "string") {
    throw buildServiceError("watchlistId is required", 400, "VALIDATION_ERROR");
  }

  const supabase = client || getSupabaseServiceClient();
  const nowIso = now.toISOString();

  const { error } = await supabase.from("watchlist_backfill_queue").upsert(
    {
      watchlist_id: watchlistId,
      updated_at: nowIso
    },
    { onConflict: "watchlist_id" }
  );

  if (error) {
    mapError(error);
  }

  return { ok: true };
}

async function fetchWatchlist({ client, watchlistId }: any = {}) {
  const { data, error } = await client
    .from("watchlists")
    .select("watchlist_id,agent_id,active,query_text,tags,price_max,geo_lat,geo_lon,distance_km,criteria,deleted_at")
    .eq("watchlist_id", watchlistId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

async function fetchRecentDeals({ client, limit }: any = {}) {
  const capped = Math.max(1, Math.min(5000, toPositiveInt(limit, 500)));
  const { data, error } = await client
    .from("deals")
    .select("deal_id,title,tags,price,currency,status,created_at")
    .in("status", ["NEW", "ACTIVE"])
    .order("created_at", { ascending: false })
    .order("deal_id", { ascending: false })
    .limit(capped);
  if (error) {
    mapError(error);
  }
  return Array.isArray(data) ? data : [];
}

async function fetchRecentLiveListings({ client, limit }: any = {}) {
  const capped = Math.max(1, Math.min(5000, toPositiveInt(limit, 500)));
  const { data, error } = await client
    .from("listings")
    .select("listing_id,title,category,condition,price_amount,currency,geo_lat,geo_lng,status,created_at")
    .eq("status", "LIVE")
    .order("created_at", { ascending: false })
    .order("listing_id", { ascending: false })
    .limit(capped);
  if (error) {
    mapError(error);
  }
  return Array.isArray(data) ? data : [];
}

async function upsertMatches({ client, rows }: any = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const { data, error } = await client
    .from("watchlist_matches")
    .upsert(rows, {
      onConflict: "watchlist_id,entity_type,entity_id",
      ignoreDuplicates: true
    })
    .select("watchlist_match_id");
  if (error) {
    mapError(error);
  }
  return Array.isArray(data) ? data.length : 0;
}

export async function runWatchlistBackfillQueue({
  limit = 20,
  dealsLimit = 500,
  listingsLimit = 500,
  now = new Date(),
  client
}: any = {}) {
  const supabase = client || getSupabaseServiceClient();
  const cappedLimit = Math.max(1, Math.min(200, toPositiveInt(limit, 20)));
  const nowIso = now.toISOString();

  const { data: queueRows, error: queueError } = await supabase
    .from("watchlist_backfill_queue")
    .select("watchlist_id,updated_at")
    .order("updated_at", { ascending: true })
    .order("watchlist_id", { ascending: true })
    .limit(cappedLimit);

  if (queueError) {
    mapError(queueError);
  }

  const rows = Array.isArray(queueRows) ? queueRows : [];
  if (rows.length === 0) {
    return { ok: true, processed_count: 0, inserted_count: 0 };
  }

  const deals = await fetchRecentDeals({ client: supabase, limit: dealsLimit });
  const listings = await fetchRecentLiveListings({ client: supabase, limit: listingsLimit });

  let processedCount = 0;
  let insertedCount = 0;

  for (const queue of rows) {
    const watchlistId = queue?.watchlist_id;
    const queueUpdatedAt = queue?.updated_at;
    if (!watchlistId || typeof watchlistId !== "string") continue;

    processedCount += 1;

    const watchlist = await fetchWatchlist({ client: supabase, watchlistId });
    if (!watchlist || watchlist.active === false || watchlist.deleted_at) {
      try {
        await supabase.from("watchlist_backfill_queue").delete().eq("watchlist_id", watchlistId).eq("updated_at", queueUpdatedAt);
      } catch (error) {
        // Best-effort cleanup.
      }
      continue;
    }

    const matchRows: any[] = [];

    for (const deal of deals) {
      const entityTokens = buildEntityTokensFromDeal(deal);
      const evaluated = evaluateWatchlistMatch({ deal, watchlist, entityTokens });
      if (!evaluated.matched) continue;
      matchRows.push({
        watchlist_id: watchlist.watchlist_id,
        agent_id: watchlist.agent_id,
        entity_type: "deal",
        entity_id: deal.deal_id,
        matched_at: nowIso,
        reason: evaluated.reason && Object.keys(evaluated.reason).length > 0 ? evaluated.reason : null
      });
    }

    for (const listing of listings) {
      const entityTokens = buildEntityTokensFromListing(listing);
      const evaluated = evaluateWatchlistMatchListing({ listing, watchlist, entityTokens });
      if (!evaluated.matched) continue;
      matchRows.push({
        watchlist_id: watchlist.watchlist_id,
        agent_id: watchlist.agent_id,
        entity_type: "listing",
        entity_id: listing.listing_id,
        matched_at: nowIso,
        reason: evaluated.reason && Object.keys(evaluated.reason).length > 0 ? evaluated.reason : null
      });
    }

    if (matchRows.length > 0) {
      insertedCount += await upsertMatches({ client: supabase, rows: matchRows });
    }

    const { error: delError } = await supabase
      .from("watchlist_backfill_queue")
      .delete()
      .eq("watchlist_id", watchlistId)
      .eq("updated_at", queueUpdatedAt);

    if (delError) {
      console.info("watchlist.backfill_queue_delete_failed", {
        watchlist_id: watchlistId,
        error: delError.message || String(delError)
      });
    }
  }

  return { ok: true, processed_count: processedCount, inserted_count: insertedCount, deals_count: deals.length, listings_count: listings.length };
}

