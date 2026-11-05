import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveCoverImageSrc } from "./cover-image";

describe("resolveCoverImageSrc", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds an encoded public storage URL with the configured bucket", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://project.supabase.co/// ");
    vi.stubEnv("NEXT_PUBLIC_LISTING_PHOTOS_BUCKET", " listing photos ");

    expect(resolveCoverImageSrc({ storage_key: " deals/summer photo #1.jpg " })).toBe(
      "https://project.supabase.co/storage/v1/object/public/listing%20photos/deals/summer%20photo%20%231.jpg"
    );
  });
});

it("Neon does not resolve bare keys or retired-project URLs through inherited Supabase config", () => {
  vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND", "neon");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://gztfmpuqtpvncdcuhqxy.supabase.co");
  try {
    for (const storage_key of [
      "listings/fixture/photo.jpg",
      "https://gztfmpuqtpvncdcuhqxy.supabase.co/storage/v1/object/public/listing-photos/fixture.jpg",
      "//gztfmpuqtpvncdcuhqxy.supabase.co/storage/v1/object/public/fixture.jpg",
      "https://GZTFMPUQTPVNCDCUHQXY.supabase.co.:443/fixture.jpg",
      "https://gztfmpuqtpvncdcuhqxy.storage.supabase.co/fixture.jpg",
      "https://gztfmpuqtpvncdcuhqxy.supabase.in/fixture.jpg",
      "https:\\gztfmpuqtpvncdcuhqxy.supabase.co\\fixture.jpg"
    ]) expect(resolveCoverImageSrc({ storage_key })).toBeNull();
  } finally { vi.unstubAllEnvs(); }
});

it("Neon preserves app assets, Blob images and other public HTTP hosts/projects", () => {
  vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND", "neon");
  try {
    for (const storage_key of [
      "/fixtures/photo.jpg",
      "https://store.public.blob.vercel-storage.com/fixture.jpg",
      "https://images.example.com/fixture.jpg",
      "http://images.example.com/fixture.jpg",
      "https://other-project.supabase.co/storage/v1/object/public/photos/fixture.jpg",
      "https://images.example.com/gztfmpuqtpvncdcuhqxy.supabase.co/fixture.jpg",
      "https://gztfmpuqtpvncdcuhqxy.supabase.co.images.example.com/fixture.jpg"
    ]) expect(resolveCoverImageSrc({ storage_key })).toBe(storage_key);
  } finally { vi.unstubAllEnvs(); }
});

it("legacy Supabase rendering still accepts its original source URLs", () => {
  vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND", "supabase");
  const storage_key = "https://gztfmpuqtpvncdcuhqxy.supabase.co/storage/v1/object/public/photos/fixture.jpg";
  try { expect(resolveCoverImageSrc({ storage_key })).toBe(storage_key); }
  finally { vi.unstubAllEnvs(); }
});


it.each([
  ["supabase", "supabase"], ["neon", "supabase"],
  ["supabase", "neon"], ["neon", "neon"]
])("uses DB=%s independently of Auth=%s for legacy image routing", (database, auth) => {
  vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND", database);
  vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND", auth);
  const base = "https://gztfmpuqtpvncdcuhqxy.supabase.co";
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", base);
  vi.stubEnv("NEXT_PUBLIC_LISTING_PHOTOS_BUCKET", "listing-photos");
  const source = `${base}/storage/v1/object/public/listing-photos/fixture.jpg`;
  try {
    expect(resolveCoverImageSrc({ storage_key: "fixture.jpg" })).toBe(database === "neon" ? null : source);
    expect(resolveCoverImageSrc({ storage_key: source })).toBe(database === "neon" ? null : source);
    const other = "https://images.example.com/fixture.jpg";
    expect(resolveCoverImageSrc({ storage_key: other })).toBe(other);
  } finally { vi.unstubAllEnvs(); }
});
