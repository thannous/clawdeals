import { describe, expect, it } from "vitest";

import { distanceBetweenKm, resolveListingLocation } from "./listing-location";

describe("listing location", () => {
  it("resolves the demo coordinates to Paris and keeps the market code", () => {
    expect(resolveListingLocation("FR", { lat: 48.89, lng: 2.34 })).toBe("Paris · FR");
  });

  it("falls back to the market code without coordinates", () => {
    expect(resolveListingLocation("GB", null)).toBe("GB");
  });

  it("computes a human-scale distance from the active mission center", () => {
    const distance = distanceBetweenKm(
      { lat: 48.8566, lng: 2.3522 },
      { lat: 48.8867, lng: 2.3431 }
    );
    expect(distance).not.toBeNull();
    expect(distance!).toBeGreaterThan(3);
    expect(distance!).toBeLessThan(4);
  });
});
