import { getSupabaseServiceClient } from "../db/supabase";
import { getAgentIdByOwnerId } from "./agents";
import { getListing } from "./listings";
import { createWatchlist, deleteWatchlistForAgent, getWatchlistForAgent } from "./watchlists";
import { mapSupabaseError } from "./supabase-errors";

const FOLLOW_KIND = "listing_follow";
const MAX_FOLLOWS = 100;

function serviceError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

function mapError(error: any): never {
  const mapped = mapSupabaseError(error);
  throw serviceError(mapped.message, mapped.status, mapped.code);
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function mapOwnerListingFollow(row: any) {
  const criteria = row?.criteria && typeof row.criteria === "object" ? row.criteria : {};
  return {
    watchlist_id: String(row.watchlist_id),
    listing_id: typeof criteria.listing_id === "string" ? criteria.listing_id : null,
    title: typeof criteria.listing_title === "string" ? criteria.listing_title : row.name || null,
    market_code: row.market_code || null,
    currency: row.currency || null,
    last_price: numeric(criteria.last_price),
    active: row.active !== false,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    alert_kind: "price_drop"
  };
}

async function findListingFollows({ agentId, listingId, limit = MAX_FOLLOWS }: any) {
  const client = getSupabaseServiceClient();
  let query = client
    .from("watchlists")
    .select("watchlist_id,agent_id,name,active,criteria,market_code,currency,created_at,updated_at")
    .eq("agent_id", agentId)
    .eq("active", true)
    .is("deleted_at", null)
    .contains("criteria", { kind: FOLLOW_KIND })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(MAX_FOLLOWS, limit)));

  if (listingId) {
    query = query.contains("criteria", { listing_id: listingId });
  }

  const { data, error } = await query;
  if (error) mapError(error);
  return Array.isArray(data) ? data : [];
}

export async function listOwnerListingFollows({ ownerId, listingId, limit = MAX_FOLLOWS }: any) {
  const agentId = await getAgentIdByOwnerId(ownerId);
  if (!agentId) return [];
  const rows = await findListingFollows({ agentId, listingId, limit });
  return rows.map(mapOwnerListingFollow);
}

export async function createOwnerListingFollow({ ownerId, listingId }: { ownerId: string; listingId: string }) {
  const [agentId, listing] = await Promise.all([getAgentIdByOwnerId(ownerId), getListing(listingId)]);
  if (!agentId) {
    throw serviceError("Connect an agent before following listings", 409, "AGENT_REQUIRED");
  }
  if (!listing || listing.status !== "LIVE") {
    throw serviceError("Listing not found", 404, "NOT_FOUND");
  }

  const existing = await findListingFollows({ agentId, listingId, limit: 1 });
  if (existing[0]) return { ...mapOwnerListingFollow(existing[0]), created: false };

  const lastPrice = numeric(listing.price_amount);
  if (lastPrice === null) {
    throw serviceError("Listing price is unavailable", 409, "PRICE_UNAVAILABLE");
  }

  const title = typeof listing.title === "string" && listing.title.trim() ? listing.title.trim() : "Listing";
  const criteria = {
    kind: FOLLOW_KIND,
    listing_id: listingId,
    listing_title: title.slice(0, 120),
    last_price: lastPrice
  };
  const created = await createWatchlist({
    agentId,
    name: `Price drop: ${title}`.slice(0, 80),
    active: true,
    criteria,
    queryText: null,
    tags: [],
    priceMax: null,
    marketCode: listing.market_code,
    currency: listing.currency,
    geoLat: null,
    geoLon: null,
    distanceKm: null
  });

  return { ...mapOwnerListingFollow(created), created: true };
}

export async function deleteOwnerListingFollow({
  ownerId,
  watchlistId,
  deletedAt
}: {
  ownerId: string;
  watchlistId: string;
  deletedAt?: Date;
}) {
  const agentId = await getAgentIdByOwnerId(ownerId);
  if (!agentId) return null;
  const watchlist = await getWatchlistForAgent({ watchlistId, agentId });
  if (!watchlist || watchlist?.criteria?.kind !== FOLLOW_KIND) return null;
  const deleted = await deleteWatchlistForAgent({ watchlistId, agentId, deletedAt });
  return deleted ? mapOwnerListingFollow(deleted) : null;
}
