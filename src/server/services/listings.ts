import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { encodeListingsCursor } from "./listings-cursor";

const DEFAULT_LIMIT = 50;

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function formatFilterValue(value) {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/"/g, "\\\"")}"`;
}

export async function createListing({
  title,
  description,
  category,
  condition,
  status,
  priceAmount,
  currency,
  geoLat,
  geoLng,
  photos,
  dealId,
  ownerId,
  agentId,
  sellerAgentId
}: any) {
  const client = getSupabaseServiceClient();
  const payload = {
    title,
    description: description || null,
    status,
    deal_id: dealId || null,
    owner_id: ownerId || null,
    agent_id: agentId || null,
    seller_agent_id: sellerAgentId,
    category,
    condition,
    price_amount: priceAmount,
    currency,
    geo_lat: geoLat ?? null,
    geo_lng: geoLng ?? null,
    photos: photos ?? null
  };
  const { data, error } = await client
    .from("listings")
    .insert(payload)
    .select("listing_id,status,created_at")
    .single();
  if (error) {
    mapError(error);
  }
  return data;
}

export async function getListing(listingId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("listings").select("*").eq("listing_id", listingId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function listListings({
  q,
  category,
  condition,
  priceMin,
  priceMax,
  sort = "recent",
  limit = DEFAULT_LIMIT,
  cursor
}: any = {}) {
  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? DEFAULT_LIMIT;

  let query = client
    .from("listings")
    .select("listing_id,title,category,condition,price_amount,currency,created_at")
    .eq("status", "LIVE")
    .limit(pageLimit + 1);

  if (category) {
    query = query.eq("category", category);
  }

  if (condition) {
    query = query.eq("condition", condition);
  }

  if (typeof priceMin === "number") {
    query = query.gte("price_amount", priceMin);
  }

  if (typeof priceMax === "number") {
    query = query.lte("price_amount", priceMax);
  }

  const orParts: string[] = [];
  const qPattern = q ? formatFilterValue(`%${q}%`) : null;
  const qParts = qPattern ? [`title.ilike.${qPattern}`, `description.ilike.${qPattern}`] : null;

  if (sort === "price_asc") {
    query = query.order("price_amount", { ascending: true }).order("listing_id", { ascending: true });
    if (cursor?.price_amount != null && cursor?.listing_id) {
      const priceAmount = formatFilterValue(cursor.price_amount);
      const listingId = formatFilterValue(cursor.listing_id);
      const cursorConds = [
        [`price_amount.gt.${priceAmount}`],
        [`price_amount.eq.${priceAmount}`, `listing_id.gt.${listingId}`]
      ];
      if (qParts) {
        qParts.forEach((qCond) => {
          cursorConds.forEach((conj) => {
            orParts.push(`and(${[qCond, ...conj].join(",")})`);
          });
        });
      } else {
        orParts.push(cursorConds[0][0], `and(${cursorConds[1].join(",")})`);
      }
    }
  } else if (sort === "price_desc") {
    query = query.order("price_amount", { ascending: false }).order("listing_id", { ascending: false });
    if (cursor?.price_amount != null && cursor?.listing_id) {
      const priceAmount = formatFilterValue(cursor.price_amount);
      const listingId = formatFilterValue(cursor.listing_id);
      const cursorConds = [
        [`price_amount.lt.${priceAmount}`],
        [`price_amount.eq.${priceAmount}`, `listing_id.lt.${listingId}`]
      ];
      if (qParts) {
        qParts.forEach((qCond) => {
          cursorConds.forEach((conj) => {
            orParts.push(`and(${[qCond, ...conj].join(",")})`);
          });
        });
      } else {
        orParts.push(cursorConds[0][0], `and(${cursorConds[1].join(",")})`);
      }
    }
  } else {
    query = query.order("created_at", { ascending: false }).order("listing_id", { ascending: false });
    if (cursor?.created_at && cursor?.listing_id) {
      const createdAt = formatFilterValue(cursor.created_at);
      const listingId = formatFilterValue(cursor.listing_id);
      const cursorConds = [
        [`created_at.lt.${createdAt}`],
        [`created_at.eq.${createdAt}`, `listing_id.lt.${listingId}`]
      ];
      if (qParts) {
        qParts.forEach((qCond) => {
          cursorConds.forEach((conj) => {
            orParts.push(`and(${[qCond, ...conj].join(",")})`);
          });
        });
      } else {
        orParts.push(cursorConds[0][0], `and(${cursorConds[1].join(",")})`);
      }
    } else if (qParts) {
      orParts.push(...qParts);
    }
  }

  // Supabase's PostgREST client only supports one `or` filter reliably (it sets a single query param),
  // so we combine q-search + keyset pagination into a single expression when both are present.
  if (orParts.length > 0) {
    query = query.or(orParts.join(","));
  } else if (qParts) {
    query = query.or(qParts.join(","));
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const rows = data || [];
  const hasMore = rows.length > pageLimit;
  const items = hasMore ? rows.slice(0, pageLimit) : rows;

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    if (sort === "price_asc" || sort === "price_desc") {
      nextCursor = encodeListingsCursor({
        sort,
        price_amount: last.price_amount,
        listing_id: last.listing_id
      });
    } else {
      nextCursor = encodeListingsCursor({
        sort: "recent",
        created_at: last.created_at,
        listing_id: last.listing_id
      });
    }
  }

  return { items, nextCursor };
}
