import crypto from "node:crypto";
import sharp from "sharp";
import {
  PASSPORT_MAX_PHOTO_BYTES,
  SMARTPHONE_CHECK_IDS,
  parseSmartphonePassportInput,
  smartphonePassportQuestions,
  type SmartphoneCheckId,
  type SmartphonePassport,
  type SmartphonePassportCheck,
  type SmartphonePassportPhoto
} from "../../lib/smartphone-passport";
import { getSupabaseServiceClient } from "../db/supabase";
import {
  assertEvidenceStoragePolicy,
  deleteEvidenceObject,
  downloadEvidenceObjectBytes,
  getEvidenceWriteBucket,
  putPrivateEvidenceObject
} from "../storage/evidence-storage";

// Existing private evidence bucket policy. The smartphone API imposes the lower
// per-photo bound itself before writing, without changing dispute storage.
const EVIDENCE_POLICY = {
  allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  maximumSizeInBytes: 50 * 1024 * 1024
};
type PassportAccess = { kind: "owner"; ownerId: string } | { kind: "public" };
type PhotoRow = {
  photo_id: string; listing_id: string; owner_id: string; check_id: SmartphoneCheckId;
  storage_bucket: string; storage_key: string; bytes: number;
  status: string; attached: boolean; created_at: string;
};
function fail(code: string, status: number, message: string): never {
  throw Object.assign(new Error(message), { code, status });
}
function dbError(error: { message?: string; code?: string }): never {
  const message = error?.message || "";
  if (message.includes("PASSPORT_NOT_FOUND")) fail("NOT_FOUND", 404, "Listing not found");
  if (message.includes("PASSPORT_LOCKED")) fail("PASSPORT_LOCKED", 409, "This listing no longer allows passport changes.");
  if (message.includes("PASSPORT_REVISION_CONFLICT")) fail("PASSPORT_REVISION_CONFLICT", 409, "The passport changed. Reload it before saving.");
  if (message.includes("PASSPORT_PHOTO_LIMIT")) fail("PASSPORT_PHOTO_LIMIT", 400, "Passport photo limit reached. Remove unused photos before uploading.");
  if (message.includes("PASSPORT_PHOTO_IN_USE")) fail("PASSPORT_PHOTO_IN_USE", 409, "Remove this photo from the passport before deleting it.");
  if (message.includes("PASSPORT_PHOTO_INVALID")) fail("PASSPORT_PHOTO_INVALID", 400, "The photo is not available for this check.");
  if (message.includes("PASSPORT_INVALID")) fail("VALIDATION_ERROR", 400, "Invalid passport");
  if (error?.code === "42P01" || error?.code === "PGRST202" || error?.code === "PGRST205") fail("PASSPORT_UNAVAILABLE", 503, "Smartphone passports are not available yet.");
  fail("PASSPORT_ERROR", 500, "Unable to access the smartphone passport.");
}

async function authorizeListing(listingId: string, access: PassportAccess) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("listings").select("listing_id,owner_id,status").eq("listing_id", listingId).maybeSingle();
  if (error) dbError(error);
  if (!data || (access.kind === "owner" ? data.owner_id !== access.ownerId : data.status !== "LIVE")) fail("NOT_FOUND", 404, "Listing not found");
  return data;
}

function photoDto(row: PhotoRow, access: PassportAccess): SmartphonePassportPhoto {
  const prefix = access.kind === "owner" ? "owner" : "public";
  return {
    photo_id: row.photo_id,
    url: `/api/v1/${prefix}/listings/${row.listing_id}/passport/photos/${row.photo_id}`,
    created_at: row.created_at
  };
}

async function passportDto(row: any, access: PassportAccess): Promise<SmartphonePassport> {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("smartphone_passport_photos")
    .select("photo_id,listing_id,check_id,created_at").eq("listing_id", row.listing_id)
    .eq("status", "READY").eq("attached", true);
  if (error) dbError(error);
  const photos = (data || []) as PhotoRow[];
  const checks: SmartphonePassportCheck[] = SMARTPHONE_CHECK_IDS.map((id) => {
    const check = row.checks[id];
    const attachedIds = new Set<string>(check.photo_ids.map((photoId: string) => photoId.toLowerCase()));
    const attachedPhotos = photos.filter((photo) => photo.check_id === id && attachedIds.has(photo.photo_id.toLowerCase()));
    return {
      id, answer: check.answer, notes: check.notes,
      status: check.answer === "unknown" ? "missing" : attachedPhotos.length ? "documented" : "declared",
      photos: attachedPhotos.map((photo) => photoDto(photo, access))
    };
  });
  return {
    listing_id: row.listing_id, revision: row.revision, model: row.model,
    battery_health_percent: row.battery_health_percent,
    checks, questions: smartphonePassportQuestions(checks, row.battery_health_percent), updated_at: row.updated_at
  };
}

export async function getSmartphonePassport(listingId: string, access: PassportAccess): Promise<SmartphonePassport | null> {
  await authorizeListing(listingId, access);
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("smartphone_passports").select("*").eq("listing_id", listingId).maybeSingle();
  if (error) dbError(error);
  const passport = data ? await passportDto(data, access) : null;
  await authorizeListing(listingId, access);
  return passport;
}

export async function saveSmartphonePassport(listingId: string, ownerId: string, rawInput: unknown): Promise<SmartphonePassport> {
  const listing = await authorizeListing(listingId, { kind: "owner", ownerId });
  if (!["DRAFT", "PENDING_APPROVAL", "LIVE"].includes(listing.status)) fail("PASSPORT_LOCKED", 409, "This listing no longer allows passport changes.");
  const input = parseSmartphonePassportInput(rawInput);
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("save_smartphone_passport_v1", {
    p_listing_id: listingId, p_owner_id: ownerId, p_expected_revision: input.expected_revision,
    p_model: input.model, p_battery_health_percent: input.battery_health_percent, p_checks: input.checks
  }).single();
  if (error || !data) dbError(error || {});
  return passportDto(data, { kind: "owner", ownerId });
}

export async function normalizePassportPhoto(contentType: unknown, base64: unknown): Promise<Buffer> {
  const formats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
  if (typeof contentType !== "string" || !Object.hasOwn(formats, contentType)) fail("VALIDATION_ERROR", 400, "Use a JPEG, PNG or WebP photo.");
  if (typeof base64 !== "string" || !base64.length || base64.length > Math.ceil(PASSPORT_MAX_PHOTO_BYTES / 3) * 4) fail("PHOTO_TOO_LARGE", 400, "Photos must be 2 MiB or smaller.");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) fail("VALIDATION_ERROR", 400, "Invalid photo encoding.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.toString("base64") !== base64) fail("VALIDATION_ERROR", 400, "Invalid photo encoding.");
  if (!bytes.length || bytes.length > PASSPORT_MAX_PHOTO_BYTES) fail("PHOTO_TOO_LARGE", 400, "Photos must be 2 MiB or smaller.");
  try {
    const source = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const metadata = await source.metadata();
    if (metadata.format !== formats[contentType] || (metadata.pages || 1) !== 1) fail("VALIDATION_ERROR", 400, "Use a non-animated photo matching its file type.");
    // Re-encoding drops EXIF/GPS and embedded documents; do not retain metadata.
    const normalized = await source.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    if (normalized.length > PASSPORT_MAX_PHOTO_BYTES) fail("PHOTO_TOO_LARGE", 400, "Photo is too large after processing.");
    return normalized;
  } catch (error: any) {
    if (error?.status === 400) throw error;
    fail("VALIDATION_ERROR", 400, "The photo cannot be decoded safely.");
  }
}

async function removeClaimedPhotos(rows: PhotoRow[]) {
  const client = getSupabaseServiceClient();
  for (const row of rows) {
    await deleteEvidenceObject(row.storage_bucket, row.storage_key);
    const { error } = await client.from("smartphone_passport_photos").delete().eq("photo_id", row.photo_id).eq("status", "DELETING");
    if (error) dbError(error);
  }
}

export async function deleteSmartphonePassportPhoto(listingId: string, ownerId: string, photoId: string | null) {
  await authorizeListing(listingId, { kind: "owner", ownerId });
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("claim_smartphone_passport_photo_deletion_v1", {
    p_listing_id: listingId, p_owner_id: ownerId, p_photo_id: photoId
  });
  if (error) dbError(error);
  if (photoId && !(data || []).length) fail("NOT_FOUND", 404, "Photo not found");
  await removeClaimedPhotos((data || []) as PhotoRow[]);
}

export async function uploadSmartphonePassportPhoto(listingId: string, ownerId: string, raw: unknown): Promise<SmartphonePassportPhoto> {
  const listing = await authorizeListing(listingId, { kind: "owner", ownerId });
  if (!["DRAFT", "PENDING_APPROVAL", "LIVE"].includes(listing.status)) fail("PASSPORT_LOCKED", 409, "This listing no longer allows passport changes.");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("VALIDATION_ERROR", 400, "Invalid photo upload");
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["check_id", "content_type", "data_base64"].includes(key)) || !SMARTPHONE_CHECK_IDS.includes(body.check_id as SmartphoneCheckId)) fail("VALIDATION_ERROR", 400, "Invalid photo check");
  const bytes = await normalizePassportPhoto(body.content_type, body.data_base64);
  // Failed cleanup remains quota-accounted. It must not silently discard rows.
  await deleteSmartphonePassportPhoto(listingId, ownerId, null);
  const bucket = getEvidenceWriteBucket();
  await assertEvidenceStoragePolicy(bucket, EVIDENCE_POLICY);
  const photoId = crypto.randomUUID();
  const key = `smartphone-passports/${listingId}/${photoId}.jpg`;
  const client = getSupabaseServiceClient();
  const { error } = await client.rpc("reserve_smartphone_passport_photo_v1", {
    p_listing_id: listingId, p_owner_id: ownerId, p_photo_id: photoId, p_check_id: body.check_id,
    p_storage_bucket: bucket, p_storage_key: key, p_bytes: bytes.length
  });
  if (error) dbError(error);
  try {
    await putPrivateEvidenceObject(bucket, key, bytes, "image/jpeg");
    const { data, error: finishError } = await client.rpc("finish_smartphone_passport_photo_v1", {
      p_listing_id: listingId, p_owner_id: ownerId, p_photo_id: photoId
    }).single();
    if (finishError || !data) dbError(finishError || {});
    return photoDto(data as PhotoRow, { kind: "owner", ownerId });
  } catch (error) {
    try { await deleteSmartphonePassportPhoto(listingId, ownerId, photoId); } catch { /* Retry after 24h; quota remains reserved. */ }
    throw error;
  }
}

export async function getSmartphonePassportPhoto(listingId: string, photoId: string, access: PassportAccess): Promise<Buffer> {
  await authorizeListing(listingId, access);
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("smartphone_passport_photos").select("*").eq("photo_id", photoId).eq("listing_id", listingId).eq("status", "READY").maybeSingle();
  if (error) dbError(error);
  if (!data || (access.kind === "owner" ? data.owner_id !== access.ownerId : !data.attached)) fail("NOT_FOUND", 404, "Photo not found");
  await assertEvidenceStoragePolicy(data.storage_bucket, EVIDENCE_POLICY);
  const bytes = await downloadEvidenceObjectBytes(data.storage_bucket, data.storage_key);
  if (bytes.length !== data.bytes || bytes.length > PASSPORT_MAX_PHOTO_BYTES) fail("PASSPORT_PHOTO_INVALID", 500, "Photo integrity check failed.");
  // Recheck visibility after the storage request to avoid serving a photo that
  // became private while the download was in flight.
  await authorizeListing(listingId, access);
  const { data: current, error: currentError } = await client.from("smartphone_passport_photos").select("photo_id,owner_id,attached,status")
    .eq("photo_id", photoId).eq("listing_id", listingId).maybeSingle();
  if (currentError) dbError(currentError);
  if (!current || current.status !== "READY" || (access.kind === "owner" ? current.owner_id !== access.ownerId : !current.attached)) fail("NOT_FOUND", 404, "Photo not found");
  return bytes;
}
