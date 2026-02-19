import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { createListing, getListing } from "./listings";
import { getMaxPhotosPerListing } from "../config/listing-media";
import {
  normalizeReadMedia,
  parseCoverImageIndex,
  parseImagesStrict,
  resolveCoverImageIndexForWrite
} from "../media/images";

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details && typeof details === "object") {
    error.details = details;
  }
  return error;
}

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function isMissingActiveDraftColumn(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("active_listing_draft_id") &&
    (message.includes("does not exist") || message.includes("schema cache"))
  );
}

function isDraftListingValid(listing: any, { ownerId, sellerAgentId }: { ownerId: string; sellerAgentId: string }) {
  if (!listing) return false;
  if (listing.status !== "DRAFT") return false;
  if (String(listing.owner_id || "") !== String(ownerId || "")) return false;
  if (String(listing.seller_agent_id || "") !== String(sellerAgentId || "")) return false;
  return true;
}

async function getChannelIdentityRow({ ownerId, channelIdentityId }: any) {
  const client = getSupabaseServiceClient();
  let { data, error } = await client
    .from("channel_identities")
    .select("channel_identity_id,owner_id,active_listing_draft_id,active_listing_draft_updated_at")
    .eq("owner_id", ownerId)
    .eq("channel_identity_id", channelIdentityId)
    .maybeSingle();
  if (error && isMissingActiveDraftColumn(error)) {
    ({ data, error } = await client
      .from("channel_identities")
      .select("channel_identity_id,owner_id")
      .eq("owner_id", ownerId)
      .eq("channel_identity_id", channelIdentityId)
      .maybeSingle());
    if (!error && data) {
      return {
        ...data,
        active_listing_draft_id: null,
        active_listing_draft_updated_at: null
      };
    }
  }
  if (error) mapError(error);
  return data || null;
}

async function setActiveDraftOnIdentity({
  ownerId,
  channelIdentityId,
  listingId,
  now = new Date()
}: {
  ownerId: string;
  channelIdentityId: string;
  listingId: string;
  now?: Date;
}) {
  const client = getSupabaseServiceClient();
  const payload = {
    active_listing_draft_id: listingId,
    active_listing_draft_updated_at: now.toISOString()
  };
  let { data, error } = await client
    .from("channel_identities")
    .update(payload)
    .eq("owner_id", ownerId)
    .eq("channel_identity_id", channelIdentityId)
    .select("channel_identity_id,active_listing_draft_id")
    .maybeSingle();
  if (error && isMissingActiveDraftColumn(error)) {
    // DB not migrated yet; keep draft creation functional but without persistence.
    return null;
  }
  if (error) mapError(error);
  return data || null;
}

export async function ensureActiveListingDraftForChannel({
  ownerId,
  channelIdentityId,
  sellerAgentId,
  now = new Date()
}: {
  ownerId: string;
  channelIdentityId: string;
  sellerAgentId: string;
  now?: Date;
}) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!channelIdentityId) throw buildServiceError("channelIdentityId is required", 400, "VALIDATION_ERROR");
  if (!sellerAgentId) throw buildServiceError("sellerAgentId is required", 400, "VALIDATION_ERROR");

  const identity = await getChannelIdentityRow({ ownerId, channelIdentityId });
  if (!identity) {
    throw buildServiceError("Channel identity not found", 404, "NOT_FOUND");
  }

  const existingId = identity.active_listing_draft_id ? String(identity.active_listing_draft_id) : null;
  if (existingId) {
    const listing = await getListing(existingId);
    if (isDraftListingValid(listing, { ownerId, sellerAgentId })) {
      await setActiveDraftOnIdentity({ ownerId, channelIdentityId, listingId: existingId, now });
      return { listingId: existingId, listing };
    }
  }

  const created = await createListing({
    title: "Untitled",
    description: null,
    category: "unknown",
    condition: "GOOD",
    status: "DRAFT",
    priceAmount: 0,
    currency: "EUR",
    geoLat: null,
    geoLng: null,
    photos: [],
    coverImageIndex: null,
    dealId: null,
    duplicateFingerprint: null,
    duplicateOverride: false,
    ownerId,
    agentId: sellerAgentId,
    sellerAgentId
  });

  const listingId = String(created.listing_id);
  await setActiveDraftOnIdentity({ ownerId, channelIdentityId, listingId, now });

  const listing = await getListing(listingId);
  return { listingId, listing };
}

export async function clearActiveListingDraftForChannel({
  ownerId,
  channelIdentityId,
  now = new Date()
}: {
  ownerId: string;
  channelIdentityId: string;
  now?: Date;
}) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!channelIdentityId) throw buildServiceError("channelIdentityId is required", 400, "VALIDATION_ERROR");

  const client = getSupabaseServiceClient();
  const payload: any = {
    active_listing_draft_id: null,
    active_listing_draft_updated_at: now.toISOString()
  };

  let { data, error } = await client
    .from("channel_identities")
    .update(payload)
    .eq("owner_id", ownerId)
    .eq("channel_identity_id", channelIdentityId)
    .select("channel_identity_id,active_listing_draft_id,active_listing_draft_updated_at")
    .maybeSingle();

  if (error && isMissingActiveDraftColumn(error)) {
    return null;
  }
  if (error) mapError(error);
  return data || null;
}

export async function appendDraftListingPhoto({
  listingId,
  sellerAgentId,
  photoRef,
  now = new Date()
}: {
  listingId: string;
  sellerAgentId: string;
  photoRef: { storage_key: string; mime: string; w?: number; h?: number };
  now?: Date;
}) {
  if (!listingId) throw buildServiceError("listingId is required", 400, "VALIDATION_ERROR");
  if (!sellerAgentId) throw buildServiceError("sellerAgentId is required", 400, "VALIDATION_ERROR");
  if (!photoRef || typeof photoRef !== "object") throw buildServiceError("photoRef is required", 400, "VALIDATION_ERROR");

  const storageKey = typeof photoRef.storage_key === "string" ? photoRef.storage_key.trim() : "";
  const mime = typeof photoRef.mime === "string" ? photoRef.mime.trim() : "";
  if (!storageKey) throw buildServiceError("photoRef.storage_key is required", 400, "VALIDATION_ERROR");
  if (!mime) throw buildServiceError("photoRef.mime is required", 400, "VALIDATION_ERROR");

  const max = getMaxPhotosPerListing();
  const photo = {
    storage_key: storageKey,
    mime,
    ...(photoRef.w != null ? { w: photoRef.w } : {}),
    ...(photoRef.h != null ? { h: photoRef.h } : {})
  };

  // Concurrency-safe append:
  // - fetch current photos
  // - attempt conditional update using updated_at as an optimistic concurrency token
  // - retry on conflict to avoid dropping concurrent photo appends
  const client = getSupabaseServiceClient();
  const maxAttempts = 5;
  const requestedMs = now instanceof Date ? now.getTime() : Date.now();
  let lastListing: any = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const listing = await getListing(listingId);
    lastListing = listing;
    if (!listing) throw buildServiceError("Listing not found", 404, "NOT_FOUND");
    if (listing.status !== "DRAFT") throw buildServiceError("Listing is not a draft", 409, "LISTING_LOCKED");
    if (String(listing.seller_agent_id || "") !== String(sellerAgentId)) {
      throw buildServiceError("Forbidden", 403, "FORBIDDEN");
    }

    const media = normalizeReadMedia({
      rawImages: listing.photos,
      rawCoverImageIndex: listing.cover_image_index
    });
    const existing = Array.isArray(media.images) ? media.images : [];
    if (existing.length >= max) {
      throw buildServiceError("Photo limit exceeded", 400, "PHOTO_LIMIT_EXCEEDED", { max_photos: max });
    }

    const prevUpdatedAt = typeof listing.updated_at === "string" && listing.updated_at.trim() ? listing.updated_at.trim() : null;
    const prevMs = prevUpdatedAt ? Date.parse(prevUpdatedAt) : NaN;
    const nextMs = Number.isFinite(prevMs) ? Math.max(requestedMs, prevMs + 1) : requestedMs;
    const nextUpdatedAt = new Date(nextMs).toISOString();

    const next = existing.concat([photo]);
    const nextCoverImageIndex = existing.length === 0 ? 0 : media.cover_image_index ?? 0;

    let query: any = client
      .from("listings")
      .update({ photos: next, cover_image_index: nextCoverImageIndex, updated_at: nextUpdatedAt })
      .eq("listing_id", listingId)
      .eq("seller_agent_id", sellerAgentId)
      .eq("status", "DRAFT");

    if (prevUpdatedAt) {
      query = query.eq("updated_at", prevUpdatedAt);
    }

    const { data, error } = await query.select("listing_id,photos,cover_image_index,title,status,updated_at").maybeSingle();
    if (error) {
      mapError(error);
    }
    if (data) {
      const photosCount = Array.isArray((data as any).photos) ? (data as any).photos.length : next.length;
      return {
        listing: data,
        photosCount,
        coverImageIndex: typeof (data as any).cover_image_index === "number" ? (data as any).cover_image_index : nextCoverImageIndex
      };
    }
  }

  // If we exhausted retries, surface a conflict so callers can decide whether to retry.
  if (lastListing && lastListing.status !== "DRAFT") throw buildServiceError("Listing is not a draft", 409, "LISTING_LOCKED");
  throw buildServiceError("Listing update conflict", 409, "CONFLICT");
}

export async function setDraftListingGeo({
  listingId,
  sellerAgentId,
  lat,
  lng,
  now = new Date()
}: {
  listingId: string;
  sellerAgentId: string;
  lat: number;
  lng: number;
  now?: Date;
}) {
  if (!listingId) throw buildServiceError("listingId is required", 400, "VALIDATION_ERROR");
  if (!sellerAgentId) throw buildServiceError("sellerAgentId is required", 400, "VALIDATION_ERROR");
  if (typeof lat !== "number" || !Number.isFinite(lat)) throw buildServiceError("lat is invalid", 400, "VALIDATION_ERROR");
  if (typeof lng !== "number" || !Number.isFinite(lng)) throw buildServiceError("lng is invalid", 400, "VALIDATION_ERROR");
  if (lat < -90 || lat > 90) throw buildServiceError("lat is invalid", 400, "VALIDATION_ERROR");
  if (lng < -180 || lng > 180) throw buildServiceError("lng is invalid", 400, "VALIDATION_ERROR");

  const listing = await getListing(listingId);
  if (!listing) throw buildServiceError("Listing not found", 404, "NOT_FOUND");
  if (listing.status !== "DRAFT") throw buildServiceError("Listing is not a draft", 409, "LISTING_LOCKED");
  if (String(listing.seller_agent_id || "") !== String(sellerAgentId)) {
    throw buildServiceError("Forbidden", 403, "FORBIDDEN");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("listings")
    .update({ geo_lat: lat, geo_lng: lng, updated_at: now.toISOString() })
    .eq("listing_id", listingId)
    .eq("seller_agent_id", sellerAgentId)
    .eq("status", "DRAFT")
    .select("listing_id,geo_lat,geo_lng,title,status,photos,cover_image_index")
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  if (!data) {
    throw buildServiceError("Listing update conflict", 409, "CONFLICT");
  }

  const photosCount = Array.isArray((data as any).photos) ? (data as any).photos.length : 0;
  return {
    listing: data,
    photosCount,
    coverImageIndex: typeof (data as any).cover_image_index === "number" ? (data as any).cover_image_index : null
  };
}

export async function replaceDraftListingPhotos({
  listingId,
  sellerAgentId,
  photos,
  coverImageIndex,
  now = new Date()
}: {
  listingId: string;
  sellerAgentId: string;
  photos: unknown;
  coverImageIndex?: number | null;
  now?: Date;
}) {
  if (!listingId) throw buildServiceError("listingId is required", 400, "VALIDATION_ERROR");
  if (!sellerAgentId) throw buildServiceError("sellerAgentId is required", 400, "VALIDATION_ERROR");

  const parsedPhotos = parseImagesStrict(photos, "photos");
  const parsedCoverImageIndex = parseCoverImageIndex(coverImageIndex);
  const resolvedCoverImageIndex = resolveCoverImageIndexForWrite({
    images: parsedPhotos,
    coverImageIndex: parsedCoverImageIndex,
    hasExplicitCoverField: coverImageIndex !== undefined
  });

  const listing = await getListing(listingId);
  if (!listing) throw buildServiceError("Listing not found", 404, "NOT_FOUND");
  if (listing.status !== "DRAFT") throw buildServiceError("Listing is not a draft", 409, "LISTING_LOCKED");
  if (String(listing.seller_agent_id || "") !== String(sellerAgentId)) {
    throw buildServiceError("Forbidden", 403, "FORBIDDEN");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("listings")
    .update({
      photos: parsedPhotos,
      cover_image_index: resolvedCoverImageIndex,
      updated_at: now.toISOString()
    })
    .eq("listing_id", listingId)
    .eq("seller_agent_id", sellerAgentId)
    .eq("status", "DRAFT")
    .select("listing_id,photos,cover_image_index,title,status,updated_at")
    .maybeSingle();

  if (error) {
    mapError(error);
  }
  if (!data) {
    throw buildServiceError("Listing update conflict", 409, "CONFLICT");
  }

  const photosCount = Array.isArray((data as any).photos) ? (data as any).photos.length : 0;
  return {
    listing: data,
    photosCount,
    coverImageIndex: typeof (data as any).cover_image_index === "number" ? (data as any).cover_image_index : null
  };
}

export async function removeDraftListingPhotoAt({
  listingId,
  sellerAgentId,
  index,
  now = new Date()
}: {
  listingId: string;
  sellerAgentId: string;
  index: number;
  now?: Date;
}) {
  if (!listingId) throw buildServiceError("listingId is required", 400, "VALIDATION_ERROR");
  if (!sellerAgentId) throw buildServiceError("sellerAgentId is required", 400, "VALIDATION_ERROR");
  if (!Number.isSafeInteger(index)) throw buildServiceError("index must be an integer", 400, "VALIDATION_ERROR");

  const listing = await getListing(listingId);
  if (!listing) throw buildServiceError("Listing not found", 404, "NOT_FOUND");
  if (listing.status !== "DRAFT") throw buildServiceError("Listing is not a draft", 409, "LISTING_LOCKED");
  if (String(listing.seller_agent_id || "") !== String(sellerAgentId)) {
    throw buildServiceError("Forbidden", 403, "FORBIDDEN");
  }

  const media = normalizeReadMedia({
    rawImages: listing.photos,
    rawCoverImageIndex: listing.cover_image_index
  });
  const existing = Array.isArray(media.images) ? media.images : [];
  if (index < 0 || index >= existing.length) {
    throw buildServiceError("Invalid photo index", 400, "INVALID_PHOTO_INDEX");
  }

  const nextPhotos = existing.filter((_entry, idx) => idx !== index);
  let nextCoverImageIndex: number | null = null;
  if (nextPhotos.length > 0) {
    const currentCover = media.cover_image_index ?? 0;
    if (currentCover === index) {
      nextCoverImageIndex = 0;
    } else if (currentCover > index) {
      nextCoverImageIndex = currentCover - 1;
    } else {
      nextCoverImageIndex = currentCover;
    }
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("listings")
    .update({
      photos: nextPhotos,
      cover_image_index: nextCoverImageIndex,
      updated_at: now.toISOString()
    })
    .eq("listing_id", listingId)
    .eq("seller_agent_id", sellerAgentId)
    .eq("status", "DRAFT")
    .select("listing_id,photos,cover_image_index,title,status,updated_at")
    .maybeSingle();

  if (error) {
    mapError(error);
  }
  if (!data) {
    throw buildServiceError("Listing update conflict", 409, "CONFLICT");
  }

  return {
    listing: data,
    photosCount: Array.isArray((data as any).photos) ? (data as any).photos.length : 0,
    coverImageIndex: typeof (data as any).cover_image_index === "number" ? (data as any).cover_image_index : null
  };
}

export async function setDraftListingCoverImage({
  listingId,
  sellerAgentId,
  coverImageIndex,
  now = new Date()
}: {
  listingId: string;
  sellerAgentId: string;
  coverImageIndex: number;
  now?: Date;
}) {
  if (!listingId) throw buildServiceError("listingId is required", 400, "VALIDATION_ERROR");
  if (!sellerAgentId) throw buildServiceError("sellerAgentId is required", 400, "VALIDATION_ERROR");
  if (!Number.isSafeInteger(coverImageIndex)) {
    throw buildServiceError("cover_image_index must be an integer", 400, "VALIDATION_ERROR");
  }

  const listing = await getListing(listingId);
  if (!listing) throw buildServiceError("Listing not found", 404, "NOT_FOUND");
  if (listing.status !== "DRAFT") throw buildServiceError("Listing is not a draft", 409, "LISTING_LOCKED");
  if (String(listing.seller_agent_id || "") !== String(sellerAgentId)) {
    throw buildServiceError("Forbidden", 403, "FORBIDDEN");
  }

  const media = normalizeReadMedia({
    rawImages: listing.photos,
    rawCoverImageIndex: listing.cover_image_index
  });
  const existing = Array.isArray(media.images) ? media.images : [];
  if (existing.length === 0) {
    throw buildServiceError("No photos in draft", 400, "INVALID_PHOTO_INDEX");
  }
  if (coverImageIndex < 0 || coverImageIndex >= existing.length) {
    throw buildServiceError("Invalid photo index", 400, "INVALID_PHOTO_INDEX");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("listings")
    .update({ cover_image_index: coverImageIndex, updated_at: now.toISOString() })
    .eq("listing_id", listingId)
    .eq("seller_agent_id", sellerAgentId)
    .eq("status", "DRAFT")
    .select("listing_id,photos,cover_image_index,title,status,updated_at")
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  if (!data) {
    throw buildServiceError("Listing update conflict", 409, "CONFLICT");
  }

  return {
    listing: data,
    photosCount: Array.isArray((data as any).photos) ? (data as any).photos.length : 0,
    coverImageIndex: typeof (data as any).cover_image_index === "number" ? (data as any).cover_image_index : coverImageIndex
  };
}
