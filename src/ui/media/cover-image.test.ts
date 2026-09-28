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
