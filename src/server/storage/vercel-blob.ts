import { del, put } from "@vercel/blob";

import { getEnv } from "../config/env";

function getListingPhotosBlobToken() {
  return (
    getEnv("LISTING_PHOTOS_BLOB_READ_WRITE_TOKEN") ||
    getEnv("BLOB_READ_WRITE_TOKEN", { required: true })
  );
}

export function isVercelBlobLocator(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "blob.vercel-storage.com" ||
        url.hostname.endsWith(".blob.vercel-storage.com"))
    );
  } catch {
    return false;
  }
}

export async function putPublicListingPhoto({
  key,
  bytes,
  contentType
}: {
  key: string;
  bytes: Buffer;
  contentType: string;
}) {
  return put(key, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType,
    token: getListingPhotosBlobToken()
  });
}

export async function deleteVercelBlob(locator: string) {
  await del(locator, { token: getListingPhotosBlobToken() });
}
