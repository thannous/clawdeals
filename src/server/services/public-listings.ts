import { listListings } from "./listings";
import { getSupabaseServiceClient } from "../db/supabase";

const PUBLIC_DEFAULT_LIMIT = 24;
const PUBLIC_MAX_LIMIT = 30;

export function mapPublicListingRow(row: any) {
  const desc = typeof row.description === "string" ? row.description : null;
  return {
    listing_id: row.listing_id,
    title: row.title,
    description: desc
      ? desc.length > 200
        ? desc.slice(0, 200) + "…"
        : desc
      : null,
    category: row.category,
    condition: row.condition,
    price: {
      amount: row.price_amount,
      currency: row.currency,
    },
    created_at: row.created_at,
  };
}

export async function listPublicListings({
  q,
  category,
  condition,
  priceMin,
  priceMax,
  sort = "recent",
  limit = PUBLIC_DEFAULT_LIMIT,
  cursor,
}: any = {}) {
  const cappedLimit = Math.max(1, Math.min(PUBLIC_MAX_LIMIT, limit ?? PUBLIC_DEFAULT_LIMIT));

  const result = await listListings({
    q,
    category,
    condition,
    priceMin,
    priceMax,
    sort,
    limit: cappedLimit,
    cursor,
    includeHidden: false,
  });

  const items = result.items || [];
  if (items.length === 0) {
    return { items: [], nextCursor: result.nextCursor };
  }

  // RPCs don't return description — batch-fetch it for the returned IDs
  const ids = items.map((r: any) => r.listing_id);
  const client = getSupabaseServiceClient();
  const { data: descRows } = await client
    .from("listings")
    .select("listing_id, description")
    .in("listing_id", ids);

  const descMap = new Map<string, string | null>();
  if (descRows) {
    for (const row of descRows) {
      descMap.set(row.listing_id, row.description ?? null);
    }
  }

  const enriched = items.map((row: any) => ({
    ...row,
    description: descMap.get(row.listing_id) ?? null,
  }));

  return { items: enriched, nextCursor: result.nextCursor };
}
