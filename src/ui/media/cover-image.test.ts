import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveCoverImageSrc } from "./cover-image";

describe("resolveCoverImageSrc", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects missing storage keys", () => {
    expect(resolveCoverImageSrc(null)).toBeNull();
    expect(resolveCoverImageSrc({ storage_key: "   " })).toBeNull();
  });

  it.each([
    "/images/local.jpg",
    "https://cdn.example.com/image.jpg",
    "http://cdn.example.com/image.jpg"
  ])("keeps direct image source %s", (source) => {
    expect(resolveCoverImageSrc({ storage_key: source })).toBe(source);
  });

  it("requires a public Supabase URL for storage keys", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    expect(resolveCoverImageSrc({ storage_key: "listings/photo.jpg" })).toBeNull();
  });

  it("builds an encoded public storage URL with the configured bucket", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://project.supabase.co/// ");
    vi.stubEnv("NEXT_PUBLIC_LISTING_PHOTOS_BUCKET", " listing photos ");

    expect(resolveCoverImageSrc({ storage_key: " deals/summer photo #1.jpg " })).toBe(
      "https://project.supabase.co/storage/v1/object/public/listing%20photos/deals/summer%20photo%20%231.jpg"
    );
  });

  it("uses the default listing photos bucket", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_LISTING_PHOTOS_BUCKET", "");

    expect(resolveCoverImageSrc({ storage_key: "photo.jpg" })).toBe(
      "https://project.supabase.co/storage/v1/object/public/listing-photos/photo.jpg"
    );
  });
});
