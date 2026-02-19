import { listListings, getListing } from "./listings";
import { getSupabaseServiceClient } from "../db/supabase";
import { getOwnerPublicProfiles } from "./owners";
import { normalizeReadMedia } from "../media/images";

const PUBLIC_DEFAULT_LIMIT = 24;
const PUBLIC_MAX_LIMIT = 30;

function isMissingListingCoverImageIndexColumn(error: any) {
  const message = error?.message || "";
  if (typeof message !== "string") return false;
  const referencesColumn = message.includes("cover_image_index");
  const missingColumnHint = message.includes("does not exist") || message.toLowerCase().includes("schema cache");
  return referencesColumn && missingColumnHint;
}

export function mapPublicListingRow(row: any, sellerInfo?: { display_name: string | null; avatar_url: string | null; verified: boolean } | null) {
  const desc = typeof row.description === "string" ? row.description : null;
  const media = normalizeReadMedia({
    rawImages: row?.photos,
    rawCoverImageIndex: row?.cover_image_index
  });
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
    images_count: typeof row?.images_count === "number" ? row.images_count : media.images_count,
    cover_image: row?.cover_image ?? media.cover_image,
    created_at: row.created_at,
    seller: sellerInfo || null,
  };
}

export async function getPublicListing(listingId: string) {
  const row = await getListing(listingId);
  if (!row || row.status !== "LIVE") return null;
  const media = normalizeReadMedia({
    rawImages: row?.photos,
    rawCoverImageIndex: row?.cover_image_index
  });

  let seller = null;
  if (row.owner_id) {
    const profiles = await getOwnerPublicProfiles([row.owner_id]);
    seller = profiles.get(row.owner_id) ?? null;
  }

  return {
    listing_id: row.listing_id,
    title: row.title,
    description: row.description ?? null,
    category: row.category,
    condition: row.condition,
    price: { amount: row.price_amount, currency: row.currency },
    images: media.images,
    photos: media.images,
    cover_image_index: media.cover_image_index,
    images_count: media.images_count,
    cover_image: media.cover_image,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    delivery_method: row.delivery_method ?? null,
    country: row.country ?? null,
    seller,
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

  // RPCs don't return description or owner_id — batch-fetch them for the returned IDs
  const ids = items.map((r: any) => r.listing_id);
  const client = getSupabaseServiceClient();
  const fetchExtraRows = async (selectColumns: string) =>
    client
      .from("listings")
      .select(selectColumns)
      .in("listing_id", ids);

  let extraRows: any[] | null = null;
  let data;
  let error;
  ({ data, error } = await fetchExtraRows("listing_id, description, owner_id, photos, cover_image_index"));

  if (error && isMissingListingCoverImageIndexColumn(error)) {
    ({ data, error } = await fetchExtraRows("listing_id, description, owner_id, photos"));
    if (!error && Array.isArray(data)) {
      data = data.map((row: any) => ({ ...row, cover_image_index: null }));
    }
  }

  if (!error && Array.isArray(data)) {
    extraRows = data;
  }

  const descMap = new Map<string, string | null>();
  const ownerMap = new Map<string, string | null>();
  const mediaMap = new Map<string, { photos: any; cover_image_index: any }>();
  if (extraRows) {
    for (const row of extraRows) {
      descMap.set(row.listing_id, row.description ?? null);
      ownerMap.set(row.listing_id, row.owner_id ?? null);
      mediaMap.set(row.listing_id, {
        photos: row.photos ?? null,
        cover_image_index: row.cover_image_index ?? null
      });
    }
  }

  // Batch-fetch seller profiles for distinct owner IDs
  const distinctOwnerIds = [...new Set(
    [...ownerMap.values()].filter((id): id is string => Boolean(id))
  )];
  const sellerProfiles = await getOwnerPublicProfiles(distinctOwnerIds);

  const enriched = items.map((row: any) => ({
    ...row,
    description: descMap.get(row.listing_id) ?? null,
    photos: mediaMap.get(row.listing_id)?.photos ?? row.photos ?? null,
    cover_image_index: mediaMap.get(row.listing_id)?.cover_image_index ?? row.cover_image_index ?? null,
    _ownerId: ownerMap.get(row.listing_id) ?? null,
  }));

  return {
    items: enriched.map((row: any) => {
      const ownerId = row._ownerId;
      const seller = ownerId ? sellerProfiles.get(ownerId) ?? null : null;
      return mapPublicListingRow(row, seller);
    }),
    nextCursor: result.nextCursor,
  };
}
