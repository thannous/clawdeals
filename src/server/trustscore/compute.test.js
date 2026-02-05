import { describe, expect, it } from "vitest";
import {
  computeAgePoints,
  computeVerificationPoints,
  computeTrustScore,
  computeBaseTrustFlags,
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

  it("computes verification points", () => {
    expect(computeVerificationPoints({ emailVerified: true, phoneVerified: true })).toBe(20);
    expect(computeVerificationPoints({ emailVerified: false, phoneVerified: true })).toBe(15);
    expect(computeVerificationPoints({ emailVerified: true, phoneVerified: false })).toBe(5);
    expect(computeVerificationPoints({ emailVerified: false, phoneVerified: false })).toBe(0);
  });

  it("computes trust score from base + age + verification", () => {
    expect(
      computeTrustScore({
        daysSinceCreated: 0,
        emailVerified: false,
        phoneVerified: false
      })
    ).toBe(10);

    expect(
      computeTrustScore({
        daysSinceCreated: 180,
        emailVerified: true,
        phoneVerified: true
      })
    ).toBe(50);
  });

  it("supports full formula toggle", () => {
    expect(
      computeTrustScore({
        daysSinceCreated: 5,
        emailVerified: false,
        phoneVerified: false,
        useFull: true
      })
    ).toBe(10);
  });

  it("computes base flags", () => {
    expect(
      computeBaseTrustFlags({
        daysSinceCreated: 0,
        emailVerified: false,
        phoneVerified: false
      })
    ).toEqual(["unverified_owner", "quarantined"]);

    expect(
      computeBaseTrustFlags({
        daysSinceCreated: 10,
        emailVerified: true,
        phoneVerified: false
      })
    ).toEqual([]);
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
