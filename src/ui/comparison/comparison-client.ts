import type { ComparisonItem } from "../../lib/smartphone-comparison";
import { passportFromResponse } from "../passport/passport-types";

export function failedComparisonItem(id: string): ComparisonItem {
  return { listing_id: id, availability: "error", listing: null, passport: null, passport_error: false };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function readItem(raw: unknown, id: string): ComparisonItem {
  if (!isRecord(raw) || raw.listing_id !== id || !["available", "unavailable", "error", "unsupported"].includes(String(raw.availability)) || typeof raw.passport_error !== "boolean") throw new Error("Invalid comparison item");
  if (raw.availability !== "available" && (raw.listing !== null || raw.passport !== null)) throw new Error("Unavailable listing leaked content");
  if (raw.passport_error && raw.passport !== null) throw new Error("Inconsistent passport error");
  if (raw.listing !== null) {
    const listing = raw.listing;
    if (!isRecord(listing) || listing.listing_id !== id || typeof listing.title !== "string" || !listing.title.trim() || typeof listing.condition !== "string" || !isRecord(listing.price) || typeof listing.price.amount !== "number" || !Number.isSafeInteger(listing.price.amount) || listing.price.amount < 0 || typeof listing.price.currency !== "string" || !/^[A-Z]{3}$/.test(listing.price.currency) || (listing.market_code !== null && typeof listing.market_code !== "string")) throw new Error("Invalid comparison listing");
  } else if (raw.availability === "available") throw new Error("Missing comparison listing");
  const passport = passportFromResponse({ data: { passport: raw.passport } }, { listingId: id, access: "public" });
  if (raw.availability !== "available" && passport) throw new Error("Invalid unavailable passport");
  return { listing_id: id, availability: raw.availability, listing: raw.listing, passport, passport_error: raw.passport_error } as ComparisonItem;
}
export async function fetchComparisonItems(ids: string[], signal: AbortSignal): Promise<ComparisonItem[]> {
  const response = await fetch(`/api/v1/public/smartphone-comparison?${new URLSearchParams({ ids: ids.join(",") })}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Comparison request failed");
  const body: unknown = await response.json();
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.items) || body.data.items.length !== ids.length) throw new Error("Invalid comparison response");
  const rawItems = body.data.items;
  return ids.map((id) => {
    const matching = rawItems.filter((item) => isRecord(item) && item.listing_id === id);
    try { return matching.length === 1 ? readItem(matching[0], id) : failedComparisonItem(id); }
    catch { return failedComparisonItem(id); }
  });
}
