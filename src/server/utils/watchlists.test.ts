import { describe, expect, it } from "vitest";
import { parseWatchlistCriteria } from "./watchlists";

describe("parseWatchlistCriteria", () => {
  it("rejects criteria with only delivery_method", () => {
    expect(() =>
      parseWatchlistCriteria({
        delivery_method: "PICKUP"
      })
    ).toThrow("criteria must include at least one filter");
  });

  it("rejects criteria with only deal_type and country", () => {
    expect(() =>
      parseWatchlistCriteria({
        deal_type: "LOCAL",
        country: "FR"
      })
    ).toThrow("criteria must include at least one filter");
  });

  it("rejects a mission whose stored search geo diverges", () => {
    expect(() =>
      parseWatchlistCriteria({
        query: "used e-bike",
        geo: { lat: 48.8566, lon: 2.3522 },
        distance_km: 10,
        mission: {
          preferred_price_max: 1200,
          hard_budget_max: 1300,
          currency: "EUR",
          requirements: [],
          autonomous_actions: ["search"],
          contact_reveal: "manual_bilateral_approval",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          location: { lat: 48.8566, lon: 2.3522, radius_km: 25 }
        }
      })
    ).toThrow("criteria geo must match criteria.mission.location");
  });
});
