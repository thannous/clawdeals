import { describe, expect, it } from "vitest";
import { calculateDealTemperature } from "./deals";

describe("deal utils", () => {

  it("temperature tends to extremes", () => {
    expect(calculateDealTemperature(1000, 0)).toBe(100);
    expect(calculateDealTemperature(0, 1000)).toBe(0);
  });

  it("temperature is monotone with weighted votes", () => {
    const base = calculateDealTemperature(1, 1);
    const moreUp = calculateDealTemperature(2, 1);
    const moreDown = calculateDealTemperature(1, 2);
    expect(moreUp).toBeGreaterThanOrEqual(base);
    expect(moreDown).toBeLessThanOrEqual(base);
  });
});
