import { getSupabaseServiceClient } from "../db/supabase";
import { matchDealToWatchlists, matchListingToWatchlists } from "./watchlist-matching";
import { mapSupabaseError } from "./supabase-errors";

type QueueEntityType = "deal" | "listing";

type QueueRow = {
  entity_type: QueueEntityType;
  entity_id: string;
  updated_at: string | null;
  attempt_count?: number | null;
  last_reason?: string | null;
};

type WatchlistMatchQueueSummary = {
  ok: true;
  scanned_count: number;
  processed_count: number;
  success_count: number;
  skipped_count: number;
  error_count: number;
  matched_count: number;
  inserted_count: number;
};

function buildServiceError(message: string, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

function toPositiveInt(value: any, fallback: number) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function normalizeLimit(limit: any) {
  return Math.max(1, Math.min(200, toPositiveInt(limit, 50)));
}

function errorMessage(error: any) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message.length > 1000 ? message.slice(0, 1000) : message;
}

async function fetchDealForMatch({ client, dealId }: { client: any; dealId: string }) {
  const { data, error } = await client
    .from("deals")
    .select("deal_id,title,tags,price,currency,status,created_at")
    .eq("deal_id", dealId)
    .in("status", ["NEW", "ACTIVE"])
    .maybeSingle();

  if (error) {
    mapError(error);
  }

  return data || null;
}

async function fetchListingForMatch({ client, listingId }: { client: any; listingId: string }) {
  const { data, error } = await client
    .from("listings")
    .select("listing_id,title,category,condition,price_amount,currency,geo_lat,geo_lng,status,delivery_method,created_at")
    .eq("listing_id", listingId)
    .eq("status", "LIVE")
    .maybeSingle();

  if (error) {
    mapError(error);
  }

  return data || null;
}

async function deleteQueueRow({ client, row }: { client: any; row: QueueRow }) {
  if (!row.updated_at) {
    console.info("watchlist.match_queue_missing_updated_at", {
      entity_type: row.entity_type,
      entity_id: row.entity_id
    });
    return;
  }

  const { error } = await client
    .from("watchlist_match_queue")
    .delete()
    .eq("entity_type", row.entity_type)
    .eq("entity_id", row.entity_id)
    .eq("updated_at", row.updated_at);

  if (error) {
    mapError(error);
  }
}

async function markQueueRowFailed({
  client,
  row,
  now,
  error
}: {
  client: any;
  row: QueueRow;
  now: Date;
  error: any;
}) {
  if (!row.updated_at) {
    console.info("watchlist.match_queue_retry_missing_updated_at", {
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      error: errorMessage(error)
    });
    return;
  }

  const attemptCount = Number.isFinite(Number(row.attempt_count)) ? Number(row.attempt_count) : 0;
  const { error: updateError } = await client
    .from("watchlist_match_queue")
    .update({
      attempt_count: attemptCount + 1,
      last_error: errorMessage(error),
      updated_at: now.toISOString()
    })
    .eq("entity_type", row.entity_type)
    .eq("entity_id", row.entity_id)
    .eq("updated_at", row.updated_at);

  if (updateError) {
    console.info("watchlist.match_queue_retry_update_failed", {
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      error: updateError.message || String(updateError)
    });
  }
}

function addMatchCounters(summary: WatchlistMatchQueueSummary, result: any) {
  const matched = Number(result?.matched_count);
  const inserted = Number(result?.inserted_count);
  if (Number.isFinite(matched) && matched > 0) summary.matched_count += matched;
  if (Number.isFinite(inserted) && inserted > 0) summary.inserted_count += inserted;
}

export async function runWatchlistMatchQueue({
  limit = 50,
  now = new Date(),
  client: injectedClient,
  matchDeal = matchDealToWatchlists,
  matchListing = matchListingToWatchlists
}: {
  limit?: number;
  now?: Date;
  client?: any;
  matchDeal?: (input: { deal: any; now?: Date; client?: any }) => Promise<any>;
  matchListing?: (input: { listing: any; now?: Date; client?: any }) => Promise<any>;
} = {}) {
  const client = injectedClient || getSupabaseServiceClient();
  const effectiveLimit = normalizeLimit(limit);

  const summary: WatchlistMatchQueueSummary = {
    ok: true,
    scanned_count: 0,
    processed_count: 0,
    success_count: 0,
    skipped_count: 0,
    error_count: 0,
    matched_count: 0,
    inserted_count: 0
  };

  const { data, error } = await client
    .from("watchlist_match_queue")
    .select("entity_type,entity_id,updated_at,attempt_count,last_reason")
    .order("updated_at", { ascending: true })
    .order("entity_type", { ascending: true })
    .order("entity_id", { ascending: true })
    .limit(effectiveLimit);

  if (error) {
    mapError(error);
  }

  const rows: QueueRow[] = Array.isArray(data) ? data : [];
  summary.scanned_count = rows.length;

  for (const row of rows) {
    if (row?.entity_type !== "deal" && row?.entity_type !== "listing") {
      summary.skipped_count += 1;
      continue;
    }

    try {
      const entity =
        row.entity_type === "deal"
          ? await fetchDealForMatch({ client, dealId: row.entity_id })
          : await fetchListingForMatch({ client, listingId: row.entity_id });

      if (!entity) {
        await deleteQueueRow({ client, row });
        summary.skipped_count += 1;
        continue;
      }

      summary.processed_count += 1;
      const result =
        row.entity_type === "deal"
          ? await matchDeal({ deal: entity, now, client })
          : await matchListing({ listing: entity, now, client });

      if (result?.ok === false) {
        throw buildServiceError(
          `Watchlist matching did not complete${result.reason ? `: ${result.reason}` : ""}`,
          503,
          "WATCHLIST_MATCH_INCOMPLETE"
        );
      }

      addMatchCounters(summary, result);
      await deleteQueueRow({ client, row });
      summary.success_count += 1;
    } catch (error) {
      summary.error_count += 1;
      await markQueueRowFailed({ client, row, now, error });
      console.info("watchlist.match_queue_row_failed", {
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        error: errorMessage(error)
      });
    }
  }

  return summary;
}
