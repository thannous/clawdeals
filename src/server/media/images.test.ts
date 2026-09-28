import { describe, expect, it } from "vitest";

import {
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

  it("validates cover_image_index as integer", () => {
    expect(parseCoverImageIndex(null)).toBeNull();
    expect(parseCoverImageIndex(0)).toBe(0);
    expect(() => parseCoverImageIndex(0.5)).toThrow("cover_image_index must be an integer");
  });
});
