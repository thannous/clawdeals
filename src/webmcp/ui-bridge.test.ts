/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyBuyMissionUi,
  applyListingsSearchUi,
  clearActiveBuyMission,
  getActiveBuyMission,
  getPageContext,
  listingsHref,
  subscribeActiveBuyMission,
  subscribeWebMcpUi
} from "./ui-bridge";

describe("webmcp ui bridge", () => {
  afterEach(() => {
    clearActiveBuyMission();
    window.history.replaceState({}, "", "/");
  });

  it("builds a listings href from filters", () => {
    expect(listingsHref({ q: "gpu", price_max: 20000, sort: "price_asc" })).toBe(
      "/browse?q=gpu&price_max=20000&sort=price_asc"
    );
  });

  it("publishes filter events and navigates when not on a listings surface", () => {
    const seen: any[] = [];
    const stop = subscribeWebMcpUi((command) => seen.push(command));
    applyListingsSearchUi({ q: "bike" });
    stop();
    expect(seen.some((command) => command.type === "filter_listings")).toBe(true);
    expect(seen.some((command) => command.type === "navigate" && command.href === "/browse?q=bike")).toBe(true);
  });

  it("reads page context from window.location", () => {
    window.history.replaceState({}, "", "/webmcp?q=ssd");
    const ctx = getPageContext();
    expect(ctx.path).toBe("/webmcp");
    expect(ctx.query.q).toBe("ssd");
  });

  it("stores and publishes a newly created buy mission", () => {
    const listener = vi.fn();
    const seen: any[] = [];
    const stopMission = subscribeActiveBuyMission(listener);
    const stopUi = subscribeWebMcpUi((command) => seen.push(command));
    const mission: any = {
      mission_id: "mission-1",
      status: "ACTIVE",
      query: "used e-bike",
      preferred_price_max: 1200,
      hard_budget_max: 1300,
      currency: "EUR",
      requirements: ["battery_health >= 80%"],
      autonomous_actions: ["search"],
      contact_reveal: "manual_bilateral_approval",
      expires_at: "2026-09-02T10:00:00.000Z",
      location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 25 }
    };

    applyBuyMissionUi(mission);
    stopMission();
    stopUi();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getActiveBuyMission()).toEqual(mission);
    expect(seen).toContainEqual({ type: "mission_created", mission });
  });

  it("clears private mission state when the agent session changes", () => {
    applyBuyMissionUi({
      mission_id: "mission-2",
      status: "ACTIVE",
      query: "cargo bike",
      preferred_price_max: null,
      hard_budget_max: 1800,
      currency: "EUR",
      requirements: [],
      autonomous_actions: ["search"],
      contact_reveal: "manual_bilateral_approval",
      expires_at: "2026-09-02T10:00:00.000Z",
      location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 25 }
    });
    clearActiveBuyMission();

    expect(getActiveBuyMission()).toBeNull();
  });
});
