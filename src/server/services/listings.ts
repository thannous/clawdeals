import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { encodeListingsCursor } from "./listings-cursor";

const DEFAULT_LIMIT = 50;

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function isRpcParamMismatch(error: any, paramName: string) {
  const message = error?.message || "";
  return typeof message === "string" && message.includes(paramName) && message.includes("schema cache");
}

function buildServiceError(message, status = 500, code = "ERROR", meta?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (meta && typeof meta === "object") {
    Object.assign(error, meta);
  }
  return error;
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
  duplicateFingerprint,
  duplicateOverride,
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
    duplicate_fingerprint: duplicateFingerprint ?? null,
    duplicate_override: Boolean(duplicateOverride),
    photos: photos ?? null
  };

  const insert = async (row: any) =>
    client
      .from("listings")
      .insert(row)
      .select("listing_id,status,created_at")
      .single();

  let { data, error } = await insert(payload);

  // Backwards-compatible fallback: allow running against DBs that haven't yet
  // been migrated to support listing duplicate detection fields.
  const message = error?.message ? String(error.message) : "";
  const missingDuplicateCols =
    error &&
    (message.includes("duplicate_fingerprint") || message.includes("duplicate_override")) &&
    (message.includes("does not exist") || message.toLowerCase().includes("schema cache"));
  if (missingDuplicateCols) {
    const fallbackPayload: any = { ...payload };
    delete fallbackPayload.duplicate_fingerprint;
    delete fallbackPayload.duplicate_override;
    ({ data, error } = await insert(fallbackPayload));
  }

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

export async function updateListingBySeller({
  listingId,
  sellerAgentId,
  expectedStatus,
  patch,
  now = new Date()
}: any = {}) {
  if (!listingId || typeof listingId !== "string") {
    throw buildServiceError("listingId is required", 400, "VALIDATION_ERROR");
  }
  if (!sellerAgentId || typeof sellerAgentId !== "string") {
    throw buildServiceError("sellerAgentId is required", 400, "VALIDATION_ERROR");
  }
  if (expectedStatus !== undefined && expectedStatus !== null && typeof expectedStatus !== "string") {
    throw buildServiceError("expectedStatus must be a string", 400, "VALIDATION_ERROR");
  }

  const allowedKeys = new Set([
    "title",
    "description",
    "price_amount",
    "currency",
    "status"
  ]);

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw buildServiceError("patch must be an object", 400, "VALIDATION_ERROR");
  }

  const payload: any = { updated_at: now.toISOString() };
  for (const [key, value] of Object.entries(patch)) {
    if (!allowedKeys.has(key)) continue;
    payload[key] = value;
  }

  // Caller should validate; we still guard against accidental empty updates.
  if (Object.keys(payload).length === 1) {
    throw buildServiceError("At least one field is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  let query: any = client
    .from("listings")
    .update(payload)
    .eq("listing_id", listingId)
    .eq("seller_agent_id", sellerAgentId);

  if (expectedStatus) {
    query = query.eq("status", expectedStatus);
  }

  const { data, error } = await query.select("listing_id,status,updated_at").maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function listListings({
  q,
  category,
  condition,
  status,
  priceMin,
  priceMax,
  sort = "recent",
  limit = DEFAULT_LIMIT,
  cursor,
  geo,
  includeHidden = false
}: any = {}) {
  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? DEFAULT_LIMIT;
  const includeHiddenValue = Boolean(includeHidden);

  if (sort === "distance") {
    const lat = geo?.lat;
    const lng = geo?.lng;
    const distanceKm = geo?.distanceKm ?? null;

    if (typeof lat !== "number" || !Number.isFinite(lat) || typeof lng !== "number" || !Number.isFinite(lng)) {
      throw buildServiceError("geo.lat and geo.lng are required for sort=distance", 400, "VALIDATION_ERROR");
    }

    const cappedLimit = Math.max(1, Math.min(100, pageLimit));

    const payload: any = {
      p_lat: lat,
      p_lng: lng,
      p_distance_km: distanceKm,
      p_include_hidden: includeHiddenValue,
      p_limit: cappedLimit,
      p_cursor_distance_m: cursor?.distance_m ?? null,
      p_cursor_listing_id: cursor?.listing_id ?? null,
      p_q: q || null,
      p_category: category || null,
      p_condition: condition || null,
      p_price_min: typeof priceMin === "number" ? priceMin : null,
      p_price_max: typeof priceMax === "number" ? priceMax : null
    };

    let data;
    let error;
    ({ data, error } = await client.rpc("list_listings_geo_v1", payload));
    if (error && payload.p_include_hidden !== undefined && isRpcParamMismatch(error, "p_include_hidden")) {
      delete payload.p_include_hidden;
      ({ data, error } = await client.rpc("list_listings_geo_v1", payload));
    }

    if (error) {
      mapError(error);
    }

    const rows = Array.isArray(data) ? data : [];
    const hasMore = rows.length > cappedLimit;
    const items = hasMore ? rows.slice(0, cappedLimit) : rows;

    let nextCursor = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1] as any;
      nextCursor = encodeListingsCursor({
        sort: "distance",
        distance_m: last.distance_m,
        listing_id: last.listing_id,
        lat,
        lng,
        distance_km: distanceKm
      });
    }

    return { items, nextCursor };
  }

  const cappedLimit = Math.max(1, Math.min(100, pageLimit));
  const fetchLimit = cappedLimit + 1;

  // Default behavior: when status isn't provided, behave like previous implementation and show LIVE only.
  const normalizedStatus = status ? status : status === null ? null : "LIVE";

  let data;
  let error;
  let rankAsOf: string | null = null;

  if (sort === "rank") {
    rankAsOf = cursor?.as_of || new Date().toISOString();
    ({ data, error } = await client.rpc("list_listings_rank_v1", {
      p_as_of: rankAsOf,
      p_status: normalizedStatus,
      p_q: q || null,
      p_category: category || null,
      p_condition: condition || null,
      p_price_min: typeof priceMin === "number" ? priceMin : null,
      p_price_max: typeof priceMax === "number" ? priceMax : null,
      p_include_hidden: includeHiddenValue,
      p_limit: fetchLimit,
      p_cursor_rank_score: cursor?.rank_score ?? null,
      p_cursor_created_at: cursor?.created_at ?? null,
      p_cursor_listing_id: cursor?.listing_id ?? null
    }));
  } else if (sort === "price_asc") {
    ({ data, error } = await client.rpc("list_listings_price_asc_v1", {
      p_status: normalizedStatus,
      p_q: q || null,
      p_category: category || null,
      p_condition: condition || null,
      p_price_min: typeof priceMin === "number" ? priceMin : null,
      p_price_max: typeof priceMax === "number" ? priceMax : null,
      p_include_hidden: includeHiddenValue,
      p_limit: fetchLimit,
      p_cursor_price_amount: cursor?.price_amount ?? null,
      p_cursor_listing_id: cursor?.listing_id ?? null
    }));
  } else if (sort === "price_desc") {
    ({ data, error } = await client.rpc("list_listings_price_desc_v1", {
      p_status: normalizedStatus,
      p_q: q || null,
      p_category: category || null,
      p_condition: condition || null,
      p_price_min: typeof priceMin === "number" ? priceMin : null,
      p_price_max: typeof priceMax === "number" ? priceMax : null,
      p_include_hidden: includeHiddenValue,
      p_limit: fetchLimit,
      p_cursor_price_amount: cursor?.price_amount ?? null,
      p_cursor_listing_id: cursor?.listing_id ?? null
    }));
  } else {
    ({ data, error } = await client.rpc("list_listings_recent_v1", {
      p_status: normalizedStatus,
      p_q: q || null,
      p_category: category || null,
      p_condition: condition || null,
      p_price_min: typeof priceMin === "number" ? priceMin : null,
      p_price_max: typeof priceMax === "number" ? priceMax : null,
      p_include_hidden: includeHiddenValue,
      p_limit: fetchLimit,
      p_cursor_created_at: cursor?.created_at ?? null,
      p_cursor_listing_id: cursor?.listing_id ?? null
    }));
  }

  if (error) {
    mapError(error);
  }

  const rows = Array.isArray(data) ? data : [];
  const hasMore = rows.length > cappedLimit;
  const items = hasMore ? rows.slice(0, cappedLimit) : rows;

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1] as any;
    if (sort === "rank") {
      nextCursor = encodeListingsCursor({
        sort: "rank",
        as_of: rankAsOf || cursor?.as_of || new Date().toISOString(),
        rank_score: last.rank_score,
        created_at: last.created_at,
        listing_id: last.listing_id
      });
    } else if (sort === "price_asc" || sort === "price_desc") {
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
