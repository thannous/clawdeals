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

  it("accepts delivery_method when combined with a legacy filter", () => {
    const parsed = parseWatchlistCriteria({
      query: "rtx 4070",
      delivery_method: "shipping"
    });

    expect(parsed.criteria.query).toBe("rtx 4070");
    expect(parsed.criteria.delivery_method).toBe("SHIPPING");
    expect(parsed.queryText).toBe("rtx 4070");
  });

  it("preserves a normalized buy mission when its search geo matches", () => {
    const parsed = parseWatchlistCriteria({
      query: "used e-bike",
      geo: { lat: 48.8566, lon: 2.3522 },
      distance_km: 25,
      mission: {
        version: 1,
        kind: "BUY",
        preferred_price_max: 1200,
        hard_budget_max: 1300,
        currency: "EUR",
        requirements: ["battery_health >= 80%"],
        autonomous_actions: ["search", "ask_question", "make_offer"],
        contact_reveal: "manual_bilateral_approval",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 25 }
      }
    });

    expect(parsed.criteria.mission).toMatchObject({
      version: 1,
      kind: "BUY",
      hard_budget_max: 1300,
      contact_reveal: "manual_bilateral_approval",
      location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 25 }
    });
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

  it("keeps historical criteria shape unchanged when there is no mission", () => {
    const parsed = parseWatchlistCriteria({ query: "rtx", price_max: 500 });

    expect(parsed.criteria).toEqual({
      query: "rtx",
      tags: [],
      price_max: 500,
      geo: null,
      distance_km: null,
      deal_type: null,
      country: null,
      delivery_method: null
    });
  });
});
