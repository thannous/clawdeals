import { describe, expect, it } from "vitest";

import { computeRatingPoints } from "./ratings";

describe("trustscore/ratings computeRatingPoints", () => {
  it("returns 0 when ratingCount is 0", () => {
    expect(computeRatingPoints({ avgRating: 5, ratingCount: 0 })).toBe(0);
  });

  it("gives small-n 5★ a low score (~2)", () => {
    expect(computeRatingPoints({ avgRating: 5, ratingCount: 1 })).toBe(2);
  });

  it("reduces impact with fractional counts (e.g. auto-completed weighting)", () => {
    expect(computeRatingPoints({ avgRating: 5, ratingCount: 0.5 })).toBe(1);
  });
});

