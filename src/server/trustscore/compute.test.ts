import { describe, expect, it } from "vitest";
import {
  computeAgePoints,
  mergeTrustFlags
} from "./compute";

describe("trustscore compute", () => {
  it("computes age points with boundaries", () => {
    expect(computeAgePoints(0)).toBe(0);
    expect(computeAgePoints(6)).toBe(0);
    expect(computeAgePoints(7)).toBe(5);
    expect(computeAgePoints(29)).toBe(5);
    expect(computeAgePoints(30)).toBe(10);
    expect(computeAgePoints(89)).toBe(10);
    expect(computeAgePoints(90)).toBe(15);
    expect(computeAgePoints(179)).toBe(15);
    expect(computeAgePoints(180)).toBe(20);
  });

  it("merges base flags with existing flags", () => {
    expect(
      mergeTrustFlags({
        existingFlags: ["under_review", "unverified_owner"],
        baseFlags: []
      })
    ).toEqual(["under_review"]);

    expect(
      mergeTrustFlags({
        existingFlags: ["under_review"],
        baseFlags: ["quarantined"]
      })
    ).toEqual(["quarantined", "under_review"]);
  });
});
