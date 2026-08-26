import { describe, expect, it } from "vitest";

import { normalizeBuyMission } from "./buy-missions";

const NOW = new Date("2026-08-26T10:00:00.000Z");

function validMission(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    kind: "BUY",
    preferred_price_max: 1200,
    hard_budget_max: 1300,
    currency: "EUR",
    requirements: ["battery_health >= 80%"],
    autonomous_actions: ["search", "ask_question", "make_offer"],
    contact_reveal: "manual_bilateral_approval",
    expires_at: "2026-09-02T10:00:00.000Z",
    location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 25 },
    ...overrides
  };
}

describe("normalizeBuyMission", () => {
  it("normalizes a valid mission and removes duplicate requirements/actions", () => {
    const result = normalizeBuyMission(
      validMission({
        requirements: ["battery_health >= 80%", " BATTERY_HEALTH >= 80% "],
        autonomous_actions: ["search", "search", "make_offer"]
      }),
      { now: NOW }
    );

    expect(result).toMatchObject({
      version: 1,
      kind: "BUY",
      preferred_price_max: 1200,
      hard_budget_max: 1300,
      currency: "EUR",
      requirements: ["battery_health >= 80%"],
      autonomous_actions: ["search", "make_offer"],
      contact_reveal: "manual_bilateral_approval",
      location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 25 }
    });
  });

  it("rejects an inverted target and hard budget", () => {
    expect(() =>
      normalizeBuyMission(validMission({ preferred_price_max: 1400, hard_budget_max: 1300 }), {
        now: NOW
      })
    ).toThrow("preferred_price_max must not exceed hard_budget_max");
  });

  it("rejects missing search authority and non-bilateral contact rules", () => {
    expect(() =>
      normalizeBuyMission(validMission({ autonomous_actions: ["make_offer"] }), { now: NOW })
    ).toThrow("autonomous_actions must include search");
    expect(() =>
      normalizeBuyMission(validMission({ contact_reveal: "automatic" }), { now: NOW })
    ).toThrow("contact_reveal must be manual_bilateral_approval");
  });

  it("rejects past expiration and expiration beyond 90 days", () => {
    expect(() =>
      normalizeBuyMission(validMission({ expires_at: "2026-08-26T09:00:00.000Z" }), { now: NOW })
    ).toThrow("expires_at must be in the future");
    expect(() =>
      normalizeBuyMission(validMission({ expires_at: "2026-12-01T10:00:00.000Z" }), { now: NOW })
    ).toThrow("expires_at must be within 90 days");
  });

  it("rejects invalid location bounds", () => {
    expect(() =>
      normalizeBuyMission(validMission({ location: { lat: 91, lon: 2, radius_km: 25 } }), {
        now: NOW
      })
    ).toThrow("location.lat must be between -90 and 90");
  });
});
