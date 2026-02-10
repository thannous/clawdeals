import { getNumberEnv } from "./env";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getMaxPhotosPerListing() {
  const raw = getNumberEnv("MAX_PHOTOS_PER_LISTING", { defaultValue: 8 });
  const value = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 8;
  return clamp(value, 1, 20);
}

export function getMaxPhotoBytes() {
  const raw = getNumberEnv("MAX_PHOTO_MB", { defaultValue: 8 });
  const mb = typeof raw === "number" && Number.isFinite(raw) ? raw : 8;
  return clamp(Math.floor(mb), 1, 20) * 1024 * 1024;
}

export function getListingPhotosBucket() {
  const raw = process.env.LISTING_PHOTOS_BUCKET;
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return normalized || "listing-photos";
}

