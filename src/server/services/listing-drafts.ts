import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { createListing, getListing } from "./listings";
import { getMaxPhotosPerListing } from "../config/listing-media";

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

  const listing = await getListing(listingId);
  if (!listing) throw buildServiceError("Listing not found", 404, "NOT_FOUND");
  if (listing.status !== "DRAFT") throw buildServiceError("Listing is not a draft", 409, "LISTING_LOCKED");
  if (String(listing.seller_agent_id || "") !== String(sellerAgentId)) {
    throw buildServiceError("Forbidden", 403, "FORBIDDEN");
  }

  const existing = Array.isArray(listing.photos) ? listing.photos : [];
  const max = getMaxPhotosPerListing();
  if (existing.length >= max) {
    throw buildServiceError("Photo limit exceeded", 400, "PHOTO_LIMIT_EXCEEDED", { max_photos: max });
  }

  const next = existing.concat([
    {
      storage_key: storageKey,
      mime,
      ...(photoRef.w != null ? { w: photoRef.w } : {}),
      ...(photoRef.h != null ? { h: photoRef.h } : {})
    }
  ]);

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("listings")
    .update({ photos: next, updated_at: now.toISOString() })
    .eq("listing_id", listingId)
    .eq("seller_agent_id", sellerAgentId)
    .eq("status", "DRAFT")
    .select("listing_id,photos,title,status")
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  if (!data) {
    throw buildServiceError("Listing update conflict", 409, "CONFLICT");
  }

  const photosCount = Array.isArray((data as any).photos) ? (data as any).photos.length : next.length;
  return { listing: data, photosCount };
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
    .select("listing_id,geo_lat,geo_lng,title,status,photos")
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  if (!data) {
    throw buildServiceError("Listing update conflict", 409, "CONFLICT");
  }

  const photosCount = Array.isArray((data as any).photos) ? (data as any).photos.length : 0;
  return { listing: data, photosCount };
}
