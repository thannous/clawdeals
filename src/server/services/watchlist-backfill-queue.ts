import { loadSmartphoneMissionSnapshots, recordSmartphoneMissionMatch } from "./smartphone-mission-matching";
import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { buildEntityTokensFromDeal, evaluateWatchlistMatch, buildEntityTokensFromListing, evaluateWatchlistMatchListing } from "../utils/matching";
import {
  WATCHLIST_BACKFILL_MAX_MATCHES,
  WATCHLIST_BACKFILL_MAX_TRANSITIONS,
  WATCHLIST_BACKFILL_TIME_BUDGET_MS,
  WATCHLIST_BACKFILL_REQUEST_TIMEOUT_MS
} from "../config/watchlists";
import { safeRecordAgentMilestone } from "./acquisition";

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

async function fetchWatchlist({ client, watchlistId, signal }: any = {}) {
  const { data, error } = await client
    .from("watchlists")
    .select("watchlist_id,agent_id,active,market_code,currency,query_text,tags,price_max,geo_lat,geo_lon,distance_km,criteria,deleted_at,updated_at")
    .eq("watchlist_id", watchlistId)
    .is("deleted_at", null)
    .abortSignal(signal)
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

async function fetchRecentDeals({ client, limit, signal }: any = {}) {
  const capped = Math.max(1, Math.min(5000, toPositiveInt(limit, 500)));
  const { data, error } = await client
    .from("deals")
    .select("deal_id,title,tags,price,currency,market_code,status,created_at")
    .in("status", ["NEW", "ACTIVE"])
    .order("created_at", { ascending: false })
    .order("deal_id", { ascending: false })
    .abortSignal(signal)
    .limit(capped);
  if (error) {
    mapError(error);
  }
  return Array.isArray(data) ? data : [];
}

async function fetchRecentLiveListings({ client, limit, signal }: any = {}) {
  const capped = Math.max(1, Math.min(5000, toPositiveInt(limit, 500)));
  const { data, error } = await client
    .from("listings")
    .select("listing_id,title,category,condition,price_amount,currency,market_code,geo_lat,geo_lng,status,created_at")
    .eq("status", "LIVE")
    .order("created_at", { ascending: false })
    .order("listing_id", { ascending: false })
    .abortSignal(signal)
    .limit(capped);
  if (error) {
    mapError(error);
  }
  return Array.isArray(data) ? data : [];
}

async function upsertMatches({ client, rows, signal }: any = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const { data, error } = await client
    .from("watchlist_matches")
    .upsert(rows, {
      onConflict: "watchlist_id,entity_type,entity_id",
      ignoreDuplicates: true
    })
    .abortSignal(signal)
    .select("watchlist_match_id");
  if (error) {
    mapError(error);
  }
  return Array.isArray(data) ? data.length : 0;
}

type BackfillProgress = {
  watchlist_id: string;
  updated_at: string;
  progress_version: number;
  scan_started_at: string | null;
  scan_limit: number | null;
  listing_cursor_created_at: string | null;
  listing_cursor_id: string | null;
  listings_scanned: number;
};

async function fetchSmartphonePage(client: any, queue: BackfillProgress, marketCode: string, limit: number, signal: AbortSignal) {
  let query = client.from("listings").select("listing_id,created_at").eq("status", "LIVE").eq("market_code", marketCode)
    .lte("created_at", queue.scan_started_at)
    .order("created_at", { ascending: false }).order("listing_id", { ascending: false });
  if (queue.listing_cursor_created_at && queue.listing_cursor_id) {
    query = query.or(`created_at.lt.${queue.listing_cursor_created_at},and(created_at.eq.${queue.listing_cursor_created_at},listing_id.lt.${queue.listing_cursor_id})`);
  }
  const { data, error } = await query.abortSignal(signal).limit(limit);
  if (error) mapError(error);
  return Array.isArray(data) ? data : [];
}

async function checkpoint(client: any, previous: BackfillProgress, next: BackfillProgress, complete: boolean, signal: AbortSignal) {
  const { data, error } = await client.rpc("checkpoint_watchlist_backfill_v1", {
    p_watchlist_id: previous.watchlist_id,
    p_generation: previous.updated_at,
    p_progress_version: previous.progress_version,
    p_scan_started_at: next.scan_started_at,
    p_scan_limit: next.scan_limit,
    p_cursor_created_at: next.listing_cursor_created_at,
    p_cursor_id: next.listing_cursor_id,
    p_listings_scanned: next.listings_scanned,
    p_complete: complete
  }).abortSignal(signal);
  if (error) mapError(error);
  return data === true;
}

export async function runWatchlistBackfillQueue({
  limit = 20,
  dealsLimit = 500,
  listingsLimit = 500,
  transitionLimit = WATCHLIST_BACKFILL_MAX_TRANSITIONS,
  now = new Date(),
  client
}: any = {}) {
  const supabase = client || getSupabaseServiceClient();
  const cappedLimit = Math.max(1, Math.min(200, toPositiveInt(limit, 20)));
  const cappedTransitions = Math.min(WATCHLIST_BACKFILL_MAX_TRANSITIONS, toPositiveInt(transitionLimit, WATCHLIST_BACKFILL_MAX_TRANSITIONS));
  const cappedScanLimit = Math.min(5000, toPositiveInt(listingsLimit, 500));
  const nowIso = now.toISOString();
  const deadline = Date.now() + WATCHLIST_BACKFILL_TIME_BUDGET_MS;
  const requestSignal = () => AbortSignal.timeout(Math.max(1, Math.min(WATCHLIST_BACKFILL_REQUEST_TIMEOUT_MS, deadline - Date.now())));
  // Reserve a full transition request and checkpoint before starting new work.
  const canWork = () => Date.now() < deadline - 2 * WATCHLIST_BACKFILL_REQUEST_TIMEOUT_MS;

  const { data: queueRows, error: queueError } = await supabase
    .from("watchlist_backfill_queue")
    .select("watchlist_id,updated_at,progress_version,scan_started_at,scan_limit,listing_cursor_created_at,listing_cursor_id,listings_scanned")
    .order("available_at", { ascending: true })
    .order("watchlist_id", { ascending: true })
    .abortSignal(requestSignal())
    .limit(cappedLimit);
  if (queueError) mapError(queueError);

  const rows = Array.isArray(queueRows) ? queueRows : [];
  let ordinaryEntities: { deals: any[]; listings: any[] } | null = null;
  let processedCount = 0;
  let insertedCount = 0;
  let transitionCount = 0;
  let completedCount = 0;
  let failedCount = 0;
  let smartphoneListingsCount = 0;

  for (const rawQueue of rows) {
    if (!canWork() || transitionCount >= cappedTransitions) break;
    const watchlistId = rawQueue?.watchlist_id;
    if (!watchlistId || typeof watchlistId !== "string") continue;
    let queue: BackfillProgress = { progress_version: 0, scan_started_at: null, scan_limit: null,
      listing_cursor_created_at: null, listing_cursor_id: null, listings_scanned: 0, ...rawQueue };
    processedCount += 1;
    try {
      const watchlist = await fetchWatchlist({ client: supabase, watchlistId, signal: requestSignal() });
      if (!watchlist || watchlist.active === false || watchlist.deleted_at) {
        const { error } = await supabase.from("watchlist_backfill_queue").delete()
          .eq("watchlist_id", watchlistId).eq("updated_at", queue.updated_at).abortSignal(requestSignal());
        if (error) mapError(error);
        completedCount += 1;
        continue;
      }
      if (watchlist.criteria?.mission?.smartphone) {
        // Persist the scan boundary before doing any transition. Retrying this
        // generation uses exactly the same boundary and total candidate cap.
        if (!queue.scan_started_at) {
          const initialized = { ...queue, scan_started_at: nowIso, scan_limit: cappedScanLimit };
          if (!await checkpoint(supabase, queue, initialized, false, requestSignal())) continue;
          queue = { ...initialized, progress_version: queue.progress_version + 1 };
        }
        const pageLimit = Math.min(cappedTransitions - transitionCount, queue.scan_limit! - queue.listings_scanned);
        if (pageLimit <= 0) {
          if (await checkpoint(supabase, queue, queue, true, requestSignal())) completedCount += 1;
          continue;
        }
        const page = await fetchSmartphonePage(supabase, queue, watchlist.market_code, pageLimit, requestSignal());
        smartphoneListingsCount += page.length;
        if (!page.length) {
          if (await checkpoint(supabase, queue, queue, true, requestSignal())) completedCount += 1;
          continue;
        }
        const snapshots = await loadSmartphoneMissionSnapshots(page.map((listing: any) => listing.listing_id), supabase, requestSignal());
        for (const listing of page) {
          if (!canWork() || transitionCount >= cappedTransitions) break;
          // Count attempts globally, including a row removed since the page read.
          // An interrupted transition is replayed safely by the idempotent RPC.
          transitionCount += 1;
          const snapshot = snapshots.get(listing.listing_id);
          if (snapshot) {
            const result = await recordSmartphoneMissionMatch({ snapshot, watchlist, client: supabase, signal: requestSignal() });
            if (result.alert) insertedCount += 1;
          }
          const next = { ...queue, listing_cursor_created_at: listing.created_at,
            listing_cursor_id: listing.listing_id, listings_scanned: queue.listings_scanned + 1 };
          const complete = next.listings_scanned >= next.scan_limit! || (listing === page[page.length - 1] && page.length < pageLimit);
          if (!await checkpoint(supabase, queue, next, complete, requestSignal())) break;
          queue = { ...next, progress_version: queue.progress_version + 1 };
          if (complete) { completedCount += 1; break; }
        }
        continue;
      }

      // Ordinary watchlists retain their existing batch matching semantics.
      if (!ordinaryEntities) {
        ordinaryEntities = {
          deals: await fetchRecentDeals({ client: supabase, limit: dealsLimit, signal: requestSignal() }),
          listings: await fetchRecentLiveListings({ client: supabase, limit: listingsLimit, signal: requestSignal() })
        };
      }
      const { deals, listings } = ordinaryEntities;
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

      let watchlistInsertedCount = 0;
      for (let offset = 0; offset < matchRows.length; offset += WATCHLIST_BACKFILL_MAX_MATCHES) {
        const batchInsertedCount = await upsertMatches({
          client: supabase,
          rows: matchRows.slice(offset, offset + WATCHLIST_BACKFILL_MAX_MATCHES),
          signal: requestSignal()
        });
        insertedCount += batchInsertedCount;
        watchlistInsertedCount += batchInsertedCount;
      }

      if (watchlistInsertedCount > 0) {
        await safeRecordAgentMilestone({
          eventName: "first_match",
          agentId: watchlist.agent_id,
          marketCode: watchlist.market_code || null,
          occurredAt: now,
          client: supabase,
          signal: requestSignal()
        });
      }

      const { error: delError } = await supabase
        .from("watchlist_backfill_queue")
        .delete()
        .eq("watchlist_id", watchlistId)
        .eq("updated_at", queue.updated_at)
        .abortSignal(requestSignal());

      if (!delError) completedCount += 1;
      if (delError) {
        console.info("watchlist.backfill_queue_delete_failed", {
          watchlist_id: watchlistId,
          error: delError.message || String(delError)
        });
      }
    } catch (error) {
      failedCount += 1;
      console.info("watchlist.backfill_deferred", { watchlist_id: watchlistId,
        error: error instanceof Error ? error.message : String(error) });
      // Keep the failed candidate, but move this generation behind other work.
      // A newer enqueue or checkpoint wins this CAS and is left untouched.
      try {
        await checkpoint(supabase, queue, { ...queue, scan_started_at: queue.scan_started_at || nowIso,
          scan_limit: queue.scan_limit || cappedScanLimit }, false, requestSignal());
      } catch { /* The unchanged queue remains recoverable on the next drain. */ }
    }
  }

  return {
    ok: true,
    processed_count: processedCount,
    inserted_count: insertedCount,
    transition_count: transitionCount,
    completed_count: completedCount,
    deferred_count: rows.length - completedCount,
    failed_count: failedCount,
    deals_count: ordinaryEntities?.deals.length || 0,
    listings_count: (ordinaryEntities?.listings.length || 0) + smartphoneListingsCount
  };
}
