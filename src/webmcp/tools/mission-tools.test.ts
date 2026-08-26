import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../http", () => ({
  callClawdealsWebmcp: vi.fn()
}));

vi.mock("../ui-bridge", () => ({
  applyBuyMissionUi: vi.fn()
}));

import { callClawdealsWebmcp } from "../http";
import { applyBuyMissionUi } from "../ui-bridge";
import { buyMissionZodSchema, missionTools } from "./mission-tools";

function validArgs(overrides: Record<string, unknown> = {}) {
  return {
    query: "used e-bike",
    market_code: "FR",
    location_label: "Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    radius_km: 25,
    preferred_price_max: 1200,
    hard_budget_max: 1300,
    requirements: ["battery_health >= 80%"],
    autonomous_actions: ["search", "ask_question", "make_offer"],
    contact_reveal: "manual_bilateral_approval",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides
  };
}

describe("create_buy_mission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shares mission budget and authority validation", () => {
    expect(
      buyMissionZodSchema.safeParse(validArgs({ preferred_price_max: 1400 })).success
    ).toBe(false);
    expect(
      buyMissionZodSchema.safeParse(validArgs({ autonomous_actions: ["make_offer"] })).success
    ).toBe(false);
    expect(
      buyMissionZodSchema.safeParse(validArgs({ contact_reveal: "automatic" })).success
    ).toBe(false);
  });

  it("creates a watchlist-backed mission with idempotency and updates the human UI", async () => {
    const args = validArgs();
    vi.mocked(callClawdealsWebmcp).mockResolvedValue({
      ok: true,
      data: {
        watchlist_id: "mission-1",
        criteria: {
          query: args.query,
          mission: {
            version: 1,
            kind: "BUY",
            preferred_price_max: 1200,
            hard_budget_max: 1300,
            currency: "EUR",
            requirements: args.requirements,
            autonomous_actions: args.autonomous_actions,
            contact_reveal: args.contact_reveal,
            expires_at: args.expires_at,
            location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 25 }
          }
        }
      },
      meta: { request_id: "server-request" }
    } as any);
    const controller = new AbortController();
    const tool = missionTools[0];

    const result = await tool.execute(args as any, {
      requestId: "mission-request",
      idempotencyKey: "mission-idempotency",
      signal: controller.signal
    });

    expect(result.ok).toBe(true);
    expect(callClawdealsWebmcp).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/v1/watchlists",
        idempotencyKey: "mission-idempotency",
        signal: controller.signal,
        body: expect.objectContaining({
          market_code: "FR",
          criteria: expect.objectContaining({
            query: "used e-bike",
            mission: expect.objectContaining({
              hard_budget_max: 1300,
              currency: "EUR",
              contact_reveal: "manual_bilateral_approval"
            })
          })
        })
      })
    );
    expect(applyBuyMissionUi).toHaveBeenCalledWith(
      expect.objectContaining({ mission_id: "mission-1", status: "ACTIVE", hard_budget_max: 1300 })
    );
  });
});
