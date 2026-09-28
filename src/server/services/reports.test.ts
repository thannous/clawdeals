import { describe, expect, it } from "vitest";
import { computeReportWeight } from "./reports";

describe("reports weight", () => {

  it("applies unverified owner malus", () => {
    const base = computeReportWeight({ trustScore: 100, trustFlags: [], quarantineApplied: false });
    const withMalus = computeReportWeight({
      trustScore: 100,
      trustFlags: ["unverified_owner"],
      quarantineApplied: false
    });
    expect(withMalus).toBeCloseTo(base * 0.3);
  });

  it("bounds weight between 0.1 and 1.0", () => {
    const low = computeReportWeight({ trustScore: 0, trustFlags: [], quarantineApplied: false });
    expect(low).toBeGreaterThanOrEqual(0.1);
    expect(low).toBeLessThanOrEqual(1.0);

    const high = computeReportWeight({ trustScore: 100, trustFlags: [], quarantineApplied: false });
    expect(high).toBeGreaterThanOrEqual(0.1);
    expect(high).toBeLessThanOrEqual(1.0);
  });
});
