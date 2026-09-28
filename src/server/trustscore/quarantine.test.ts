import { describe, expect, it } from "vitest";
import {
  computeDaysSinceCreated,
  computeBaseWeight} from "./quarantine";

describe("trustscore quarantine", () => {
  it("computes days since created safely", () => {
    const now = new Date("2026-02-05T12:00:00Z");
    expect(computeDaysSinceCreated("2026-02-05T00:00:00Z", now)).toBe(0);
    expect(computeDaysSinceCreated("2026-01-26T00:00:00Z", now)).toBe(10);
  });

  it("computes base weight with caps", () => {
    expect(computeBaseWeight(0)).toBeCloseTo(0.25);
    expect(computeBaseWeight(100)).toBeCloseTo(1.0);
    expect(computeBaseWeight(200)).toBeCloseTo(1.0);
  });
});
