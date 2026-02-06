import { describe, expect, it } from "vitest";
import {
  computeDaysSinceCreated,
  isQuarantined,
  computeBaseWeight,
  getQuarantineMultiplier,
  computeActionWeight
} from "./quarantine";

describe("trustscore quarantine", () => {
  it("computes days since created safely", () => {
    const now = new Date("2026-02-05T12:00:00Z");
    expect(computeDaysSinceCreated("2026-02-05T00:00:00Z", now)).toBe(0);
    expect(computeDaysSinceCreated("2026-01-26T00:00:00Z", now)).toBe(10);
  });

  it("detects quarantine by age or incident flags", () => {
    expect(isQuarantined({ daysSinceCreated: 0, trustFlags: [] })).toBe(true);
    expect(isQuarantined({ daysSinceCreated: 10, trustFlags: [] })).toBe(false);
    expect(isQuarantined({ daysSinceCreated: 10, trustFlags: ["under_review"] })).toBe(true);
  });

  it("computes base weight with caps", () => {
    expect(computeBaseWeight(0)).toBeCloseTo(0.25);
    expect(computeBaseWeight(100)).toBeCloseTo(1.0);
    expect(computeBaseWeight(200)).toBeCloseTo(1.0);
  });

  it("uses quarantine multipliers by action type", () => {
    expect(getQuarantineMultiplier("deal.create")).toBeCloseTo(0.5);
    expect(getQuarantineMultiplier("message.send")).toBeCloseTo(0.35);
    expect(getQuarantineMultiplier("unknown.action")).toBeCloseTo(1.0);
  });

  it("computes action weight with quarantine", () => {
    const result = computeActionWeight({
      trustScore: 10,
      trustFlags: [],
      daysSinceCreated: 1,
      actionType: "message.send"
    });
    expect(result.quarantineApplied).toBe(true);
    expect(result.quarantineMultiplier).toBeCloseTo(0.35);
    expect(result.actionWeight).toBeCloseTo(result.baseWeight * 0.35);
  });
});
