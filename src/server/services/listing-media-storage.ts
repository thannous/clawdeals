import crypto from "node:crypto";

import { getListingStorageBackend } from "../config/backends";
import { getListingPhotosBucket, getMaxPhotoBytes } from "../config/listing-media";
import { getSupabaseServiceClient } from "../db/supabase";
import {
  deleteVercelBlob,
  isVercelBlobLocator,
  putPublicListingPhoto
} from "../storage/vercel-blob";
import { mapSupabaseError } from "./supabase-errors";

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

function mapStorageError(error: any): never {
  throw buildServiceError(error?.message || "Storage error", 500, "STORAGE_ERROR");
}

function extFromMime(mime: string) {
  const normalized = String(mime || "").trim().toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  return null;
}

export async function uploadListingPhoto({
  listingId,
  bytes,
  mime,
  bucket
}: {
  listingId: string;
  bytes: Buffer;
  mime: string;
  bucket?: string;
}) {
  if (!listingId || typeof listingId !== "string") {
    throw buildServiceError("listingId is required", 400, "VALIDATION_ERROR");
  }
  if (!bytes || !(bytes instanceof Buffer) || bytes.byteLength <= 0) {
    throw buildServiceError("bytes is required", 400, "VALIDATION_ERROR");
  }
  if (!mime || typeof mime !== "string") {
    throw buildServiceError("mime is required", 400, "VALIDATION_ERROR");
  }

  const maxBytes = getMaxPhotoBytes();
  if (bytes.byteLength > maxBytes) {
    throw buildServiceError("Photo too large", 400, "PHOTO_TOO_LARGE", {
      max_bytes: maxBytes,
      bytes: bytes.byteLength
    });
  }

  const ext = extFromMime(mime);
  if (!ext) {
    throw buildServiceError("Unsupported mime", 400, "VALIDATION_ERROR");
  }

  const resolvedBucket = (bucket && typeof bucket === "string" ? bucket.trim() : "") || getListingPhotosBucket();
  const key = `listings/${listingId}/${crypto.randomUUID()}.${ext}`;

  if (getListingStorageBackend() === "vercel-blob") {
    try {
      const blob = await putPublicListingPhoto({ key, bytes, contentType: mime });
      return {
        bucket: resolvedBucket,
        storage_key: blob.url,
        bytes: bytes.byteLength,
        mime: String(mime).trim().toLowerCase()
      };
    } catch (error) {
      mapStorageError(error);
    }
  }

  const client = getSupabaseServiceClient();
  const { error } = await client.storage.from(resolvedBucket).upload(key, bytes, { contentType: mime, upsert: false });
  if (error) mapError(error);

  return {
    bucket: resolvedBucket,
    storage_key: key,
    bytes: bytes.byteLength,
    mime: String(mime).trim().toLowerCase()
  };
}

export async function deleteListingPhoto({
  storageKey,
  bucket
}: {
  storageKey: string;
  bucket?: string;
}) {
  const key = typeof storageKey === "string" ? storageKey.trim() : "";
  if (!key) {
    throw buildServiceError("storageKey is required", 400, "VALIDATION_ERROR");
  }

  const resolvedBucket = (bucket && typeof bucket === "string" ? bucket.trim() : "") || getListingPhotosBucket();
  if (isVercelBlobLocator(key)) {
    try {
      await deleteVercelBlob(key);
      return { ok: true };
    } catch (error) {
      mapStorageError(error);
    }
  }

  const client = getSupabaseServiceClient();
  const { error } = await client.storage.from(resolvedBucket).remove([key]);
  if (error) {
    mapError(error);
  }
  return { ok: true };
}
