import { describe, expect, it } from "vitest";

import {
  normalizeReadMedia,
  parseCoverImageIndex,
  parseImagesStrict,
  parseListingsImagesInput,
  resolveCoverImageIndexForWrite
} from "./images";

function makeImage(index: number) {
  return {
    storage_key: `listings/test/${index}.jpg`,
    mime: "image/jpeg"
  };
}

describe("media/images", () => {
  it("accepts 0..8 images and rejects 9+", () => {
    expect(parseImagesStrict([], "images")).toEqual([]);
    expect(parseImagesStrict(Array.from({ length: 8 }, (_, i) => makeImage(i)), "images")).toHaveLength(8);
    expect(() => parseImagesStrict(Array.from({ length: 9 }, (_, i) => makeImage(i)), "images")).toThrow(
      "images must contain 0..8 images"
    );
  });

  it("defaults cover index to 0 when images are non-empty and no explicit cover is provided", () => {
    const images = parseImagesStrict([makeImage(0), makeImage(1)], "images");
    const cover = resolveCoverImageIndexForWrite({
      images,
      coverImageIndex: null,
      hasExplicitCoverField: false
    });
    expect(cover).toBe(0);
  });

  it("requires null cover index when images are empty", () => {
    const cover = resolveCoverImageIndexForWrite({
      images: [],
      coverImageIndex: null,
      hasExplicitCoverField: false
    });
    expect(cover).toBeNull();

    expect(() =>
      resolveCoverImageIndexForWrite({
        images: [],
        coverImageIndex: 0,
        hasExplicitCoverField: true
      })
    ).toThrow("cover_image_index must be null when images is empty");
  });

  it("rejects out-of-bounds cover index", () => {
    const images = parseImagesStrict([makeImage(0)], "images");
    expect(() =>
      resolveCoverImageIndexForWrite({
        images,
        coverImageIndex: 1,
        hasExplicitCoverField: true
      })
    ).toThrow("cover_image_index is out of bounds");
  });

  it("rejects conflict when images and photos are both provided and differ", () => {
    expect(() =>
      parseListingsImagesInput({
        images: [makeImage(0)],
        photos: [makeImage(1)]
      })
    ).toThrow("images and photos must match when both are provided");
  });

  it("normalizes read media with API fallback cover index", () => {
    const media = normalizeReadMedia({
      rawImages: [makeImage(0), makeImage(1)],
      rawCoverImageIndex: 99
    });
    expect(media.cover_image_index).toBe(0);
    expect(media.cover_image?.storage_key).toBe("listings/test/0.jpg");
    expect(media.images_count).toBe(2);
  });

  it("validates cover_image_index as integer", () => {
    expect(parseCoverImageIndex(null)).toBeNull();
    expect(parseCoverImageIndex(0)).toBe(0);
    expect(() => parseCoverImageIndex(0.5)).toThrow("cover_image_index must be an integer");
  });
});
