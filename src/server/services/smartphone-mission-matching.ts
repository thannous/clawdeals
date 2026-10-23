import { matchesSmartphoneMissionQuery } from "../../lib/smartphone-mission-query";
import { SMARTPHONE_CHECK_IDS, isSmartphoneListing } from "../../lib/smartphone-passport";
import { evaluateSmartphoneMission, type SmartphoneMissionPassport } from "../../lib/smartphone-mission";
import { getSupabaseServiceClient } from "../db/supabase";
import { evaluateWatchlistMatchListing, type WatchlistMatchReason } from "../utils/matching";
import { mapPublicListingRow } from "./public-listings";

// Every field used by matching is checked again atomically when recording a transition.
const FIELDS = "listing_id,title,description,category,condition,price_amount,currency,market_code,geo_lat,geo_lng,status,delivery_method,created_at,photos,cover_image_index";
export type SmartphoneMissionSnapshot = { listing: any; passport: SmartphoneMissionPassport | null; revision: number; visible: boolean };
function unavailable(): never { throw Object.assign(new Error("Smartphone mission evaluation unavailable"), { status: 503, code: "SERVICE_UNAVAILABLE" }); }
export async function loadSmartphoneMissionSnapshots(ids: string[], client = getSupabaseServiceClient(), signal?: AbortSignal): Promise<Map<string, SmartphoneMissionSnapshot>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const passportsQuery = client.from("smartphone_passports").select("listing_id,revision,model,battery_health_percent,checks").in("listing_id", unique);
  const passports = await (signal ? passportsQuery.abortSignal(signal) : passportsQuery);
  if (passports.error || !Array.isArray(passports.data)) unavailable();
  // Read public visibility only after all passport I/O has finished.
  const listingsQuery = client.from("listings").select(FIELDS).in("listing_id", unique);
  const listings = await (signal ? listingsQuery.abortSignal(signal) : listingsQuery);
  if (listings.error || !Array.isArray(listings.data)) unavailable();
  const moderationQuery = client.from("moderation_states").select("entity_id").eq("entity_type", "listing").in("entity_id", unique).eq("hidden", true);
  const moderation = await (signal ? moderationQuery.abortSignal(signal) : moderationQuery);
  if (moderation.error || !Array.isArray(moderation.data)) unavailable();
  const passportRows = new Map<string, any>((passports.data || []).map((row: any) => [row.listing_id, row]));
  const hidden = new Set((moderation.data || []).map((row: any) => row.entity_id));
  return new Map((listings.data || []).map((listing: any) => {
    const row = passportRows.get(listing.listing_id);
    const passport: SmartphoneMissionPassport | null = row ? {
      model: row.model, battery_health_percent: row.battery_health_percent,
      checks: SMARTPHONE_CHECK_IDS.map(id => ({ id, answer: row.checks?.[id]?.answer ?? "unknown" }))
    } : null;
    return [listing.listing_id, { listing, passport, revision: row?.revision || 0, visible: listing.status === "LIVE" && !hidden.has(listing.listing_id) }];
  }));
}
export function evaluateSmartphoneMissionSnapshot(snapshot: SmartphoneMissionSnapshot, watchlist: any) {
  const smartphone = evaluateSmartphoneMission(watchlist.criteria.mission.smartphone, snapshot.passport);
  const queryMatched = matchesSmartphoneMissionQuery(watchlist.criteria.query, snapshot.listing, snapshot.passport?.model);
  // Owner responses keep tags inside criteria; queue rows also expose the column.
  const effective = { ...watchlist, tags: watchlist.tags ?? watchlist.criteria.tags ?? [], query_text: null, criteria: { ...watchlist.criteria, query: null } };
  const base = evaluateWatchlistMatchListing({ listing: snapshot.listing, watchlist: effective, skipSmartphone: true });
  const phone = snapshot.passport !== null || isSmartphoneListing(snapshot.listing.category, snapshot.listing.title);
  const reason: WatchlistMatchReason = { ...base.reason, query_ok: queryMatched, smartphone };
  return { matched: snapshot.visible && phone && queryMatched && base.matched && smartphone.status === "compatible", baseMatched: snapshot.visible && phone && queryMatched && base.matched, smartphone, reason };
}
export async function recordSmartphoneMissionMatch({ snapshot, watchlist, client = getSupabaseServiceClient(), signal }: { snapshot: SmartphoneMissionSnapshot; watchlist: any; client?: any; signal?: AbortSignal }) {
  const evaluation = evaluateSmartphoneMissionSnapshot(snapshot, watchlist);
  const request = client.rpc("record_smartphone_mission_match_v1", {
    p_watchlist_id: watchlist.watchlist_id, p_listing_id: snapshot.listing.listing_id,
    p_listing_snapshot: snapshot.listing, p_watchlist_updated_at: watchlist.updated_at,
    p_criteria: watchlist.criteria, p_passport_revision: snapshot.revision,
    p_compatible: evaluation.matched, p_reason: evaluation.reason
  });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error || !data || data.stale) unavailable();
  return { matched: data.matched === true, alert: data.alert || null };
}
export async function getSmartphoneMissionAlerts(watchlist: any) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("watchlist_matches").select("entity_id,matched_at,reason")
    .eq("watchlist_id", watchlist.watchlist_id).eq("entity_type", "listing").order("matched_at", { ascending: false }).limit(20);
  if (error) unavailable();
  const rows = data || [];
  const snapshots = await loadSmartphoneMissionSnapshots(rows.map((row: any) => row.entity_id), client);
  return rows.flatMap((row: any) => {
    const snapshot = snapshots.get(row.entity_id);
    if (!snapshot || !evaluateSmartphoneMissionSnapshot(snapshot, watchlist).matched || !row.reason?.smartphone) return [];
    const reason = {
      smartphone: row.reason.smartphone, change: row.reason.change,
      ...(typeof row.reason.previous_price === "number" ? { previous_price: row.reason.previous_price } : {}),
      ...(typeof row.reason.current_price === "number" ? { current_price: row.reason.current_price } : {}),
      ...(typeof row.reason.passport_revision === "number" ? { passport_revision: row.reason.passport_revision } : {})
    };
    return [{ listing_id: row.entity_id, matched_at: row.matched_at, reason, listing: mapPublicListingRow(snapshot.listing) }];
  });
}
