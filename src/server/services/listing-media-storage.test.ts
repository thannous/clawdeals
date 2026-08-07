import { beforeEach, describe, expect, it, vi } from "vitest";

const { upload, remove, from, put, del } = vi.hoisted(() => {
  const upload = vi.fn();
  const remove = vi.fn();
  return {
    upload,
    remove,
    from: vi.fn(() => ({ upload, remove })),
    put: vi.fn(),
    del: vi.fn()
  };
});

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: () => ({ storage: { from } })
}));

vi.mock("@vercel/blob", () => ({ put, del }));

import { deleteListingPhoto, uploadListingPhoto } from "./listing-media-storage";

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ error: null });
  remove.mockReset().mockResolvedValue({ error: null });
  from.mockClear();
  put.mockReset();
  del.mockReset().mockResolvedValue(undefined);
  delete process.env.CLAWDEALS_OBJECT_STORAGE_BACKEND;
  delete process.env.LISTING_PHOTOS_BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("listing media storage migration", () => {
  it("keeps existing Supabase uploads as the default", async () => {
    const result = await uploadListingPhoto({
      listingId: "listing-1",
      bytes: Buffer.from("photo"),
      mime: "image/jpeg"
    });

    expect(from).toHaveBeenCalledWith("listing-photos");
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^listings\/listing-1\/[0-9a-f-]+\.jpg$/),
      expect.any(Buffer),
      { contentType: "image/jpeg", upsert: false }
    );
    expect(result.storage_key).toMatch(/^listings\/listing-1\//);
    expect(put).not.toHaveBeenCalled();
  });

  it("can switch new listing uploads to Vercel Blob without changing callers", async () => {
    process.env.CLAWDEALS_OBJECT_STORAGE_BACKEND = "vercel-blob";
    process.env.LISTING_PHOTOS_BLOB_READ_WRITE_TOKEN = "blob-token";
    put.mockResolvedValue({
      url: "https://store.public.blob.vercel-storage.com/listings/listing-1/photo.jpg",
      pathname: "listings/listing-1/photo.jpg"
    });

    const result = await uploadListingPhoto({
      listingId: "listing-1",
      bytes: Buffer.from("photo"),
      mime: "image/jpeg"
    });

    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^listings\/listing-1\/[0-9a-f-]+\.jpg$/),
      expect.any(Buffer),
      expect.objectContaining({
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "image/jpeg",
        token: "blob-token"
      })
    );
    expect(result.storage_key).toBe(
      "https://store.public.blob.vercel-storage.com/listings/listing-1/photo.jpg"
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it("routes deletion by locator so Supabase and Blob objects can coexist", async () => {
    process.env.LISTING_PHOTOS_BLOB_READ_WRITE_TOKEN = "blob-token";

    await deleteListingPhoto({
      storageKey: "https://store.public.blob.vercel-storage.com/listings/listing-1/photo.jpg"
    });
    await deleteListingPhoto({ storageKey: "listings/listing-1/legacy.jpg" });

    expect(del).toHaveBeenCalledWith(
      "https://store.public.blob.vercel-storage.com/listings/listing-1/photo.jpg",
      { token: "blob-token" }
    );
    expect(remove).toHaveBeenCalledWith(["listings/listing-1/legacy.jpg"]);
  });
});
