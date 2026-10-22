import { isSmartphoneListing } from "../../lib/smartphone-passport";
import { parseComparisonIds, type ComparisonItem, type ComparisonListing } from "../../lib/smartphone-comparison";
import { getSupabaseServiceClient } from "../db/supabase";
import { getSmartphonePassport } from "./smartphone-passports";

const PUBLIC_FIELDS = "listing_id,title,category,condition,price_amount,currency,market_code,status";
function emptyItem(listingId: string, availability: ComparisonItem["availability"]): ComparisonItem {
  return { listing_id: listingId, availability, listing: null, passport: null, passport_error: false };
}
async function liveListing(listingId: string) {
  const { data, error } = await getSupabaseServiceClient().from("listings").select(PUBLIC_FIELDS)
    .eq("listing_id", listingId).eq("status", "LIVE").maybeSingle();
  if (error) throw new Error("Comparison listing unavailable");
  if (data?.status !== "LIVE") return null;
  const { data: hidden, error: moderationError } = await getSupabaseServiceClient().from("moderation_states")
    .select("entity_id").eq("entity_type", "listing").eq("entity_id", listingId).eq("hidden", true).maybeSingle();
  if (moderationError) throw new Error("Comparison visibility unavailable");
  return hidden ? null : data;
}
function listingDto(row: any): ComparisonListing {
  return {
    listing_id: row.listing_id, title: row.title, condition: row.condition,
    price: { amount: row.price_amount, currency: row.currency }, market_code: row.market_code ?? null
  };
}
async function collectItem(listingId: string): Promise<ComparisonItem> {
  try {
    const first = await liveListing(listingId);
    if (!first) return emptyItem(listingId, "unavailable");
    let passport = null;
    let passportError = false;
    try {
      passport = await getSmartphonePassport(listingId, { kind: "public" });
    } catch (error: any) {
      if (error?.status === 404) return emptyItem(listingId, "unavailable");
      passportError = true;
    }
    // This candidate is internal until the whole batch passes its final checks.
    return { listing_id: listingId, availability: "available", listing: listingDto(first), passport, passport_error: passportError };
  } catch {
    // Failure is per item; never leak raw database/provider errors or private rows.
    return emptyItem(listingId, "error");
  }
}

export async function getSmartphoneComparison(rawIds: unknown): Promise<ComparisonItem[]> {
  // Enforce shape, quota, uniqueness and canonical UUIDs before any database I/O.
  const ids = parseComparisonIds(rawIds);
  const items = await Promise.all(ids.map(collectItem));
  const candidateIds = items.filter((item) => item.availability === "available").map((item) => item.listing_id);
  if (!candidateIds.length) return items;
  try {
    // Recheck the entire batch only after every passport finishes. Otherwise a
    // fast item can become private while a slower peer is still being loaded.
    const { data: current, error } = await getSupabaseServiceClient().from("listings").select(PUBLIC_FIELDS)
      .in("listing_id", candidateIds).eq("status", "LIVE");
    if (error || !Array.isArray(current)) throw new Error("Comparison listings unavailable");
    const { data: hidden, error: moderationError } = await getSupabaseServiceClient().from("moderation_states")
      .select("entity_id").eq("entity_type", "listing").in("entity_id", candidateIds).eq("hidden", true);
    if (moderationError || !Array.isArray(hidden)) throw new Error("Comparison visibility unavailable");
    const rows = new Map(current.filter((row) => row.status === "LIVE").map((row) => [row.listing_id, row]));
    const hiddenIds = new Set(hidden.map((row) => row.entity_id));
    return items.map((item) => {
      if (item.availability !== "available") return item;
      const row = rows.get(item.listing_id);
      if (!row || hiddenIds.has(item.listing_id)) return emptyItem(item.listing_id, "unavailable");
      if (!item.passport && !isSmartphoneListing(row.category, row.title)) return emptyItem(item.listing_id, item.passport_error ? "error" : "unsupported");
      return { ...item, listing: listingDto(row) };
    });
  } catch {
    // A failed batch visibility check cannot establish public access for any
    // candidate. Earlier per-item failures remain isolated and expose no details.
    return items.map((item) => item.availability === "available" ? emptyItem(item.listing_id, "error") : item);
  }
}
