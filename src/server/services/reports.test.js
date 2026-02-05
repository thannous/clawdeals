import { describe, expect, it } from "vitest";
import { computeReportWeight } from "./reports";

describe("reports weight", () => {
  it("returns 0 when quarantined", () => {
    expect(computeReportWeight({ trustScore: 50, trustFlags: [], quarantineApplied: true })).toBe(0);
  });

  it("applies unverified owner malus", () => {
    const base = computeReportWeight({ trustScore: 100, trustFlags: [], quarantineApplied: false });
    const withMalus = computeReportWeight({
      trustScore: 100,
      trustFlags: ["unverified_owner"],
      quarantineApplied: false
    });
    expect(withMalus).toBeCloseTo(base * 0.3);
  });
});
