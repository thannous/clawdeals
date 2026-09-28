/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const executeTool = vi.fn();

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const messages: Record<string, string> = {
      "mission.defaults.query": "used e-bike",
      "mission.cities.paris": "Paris",
      "mission.cities.london": "London",
      "mission.cities.lyon": "Lyon",
      "mission.cities.marseille": "Marseille",
      "mission.cities.madrid": "Madrid",
      "mission.listingLocation": "Listing location",
      "mission.toolDescription": "Fill the form; the human reviews it.",
      "mission.fields.query": "What to find",
      "mission.params.query": "The product or item to find.",
      "mission.autonomy.search.label": "Search and rank listings",
      "mission.autonomy.ask.label": "Ask the seller questions",
      "mission.autonomy.offer.label": "Make policy-compliant offers",
      "mission.result.createdWithReceipt": "Mission created.",
      "mission.result.created": "Mission created.",
      "mission.result.denied": "Confirmation declined. Nothing was created.",
      "mission.summary.active": "Active",
      "mission.summary.bilateral": "Bilateral approval only",
      "mission.prefill": "Prefilled from {title}",
      "mission.countries.fr": "France",
      "mission.countries.gb": "United Kingdom",
      "mission.countries.es": "Spain"
    };
    return (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => values?.[name] || "");
  }
}));

vi.mock("../../webmcp/WebMcpProvider", () => ({
  useWebMcp: () => ({ executeTool })
}));

import { clearActiveBuyMission } from "../../webmcp/ui-bridge";
import BuyMissionPanel, { prefillFromListing } from "./BuyMissionPanel";

describe("BuyMissionPanel", () => {
  afterEach(() => {
    cleanup();
    clearActiveBuyMission();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    executeTool.mockResolvedValue({
      ok: true,
      data: {},
      meta: { request_id: "request-1" }
    });
  });

  it("prefills the mission from a listing and submits the derived limits", async () => {
    const prefill = prefillFromListing({
      title: "Used e-bike urban commute - battery health 88%",
      category: "mobility",
      price: 1150,
      marketCode: "FR",
      latitude: 48.86,
      longitude: 2.35
    });

    expect(prefill).toEqual({
      query: "Used e-bike urban commute - battery health 88%",
      listingTitle: "Used e-bike urban commute - battery health 88%",
      marketCode: "FR",
      preferredPriceMax: "1150",
      hardBudgetMax: "1265",
      latitude: "48.86",
      longitude: "2.35",
      locationLabelKey: "mission.listingLocation",
      requirements: ""
    });

    render(<BuyMissionPanel prefill={prefill} />);
    expect(screen.getByTestId("buy-mission-prefill-note").textContent).toContain("battery health 88%");
    expect((screen.getByTestId("buy-mission-city") as HTMLSelectElement).value).toBe("custom");

    fireEvent.submit(screen.getByTestId("buy-mission-form"));

    await waitFor(() => expect(executeTool).toHaveBeenCalledTimes(1));
    expect(executeTool).toHaveBeenCalledWith(
      "create_buy_mission",
      expect.objectContaining({
        query: "Used e-bike urban commute - battery health 88%",
        market_code: "FR",
        latitude: 48.86,
        longitude: 2.35,
        preferred_price_max: 1150,
        hard_budget_max: 1265
      })
    );
  });

  it("falls back to the category and ignores unsupported markets when prefilling", () => {
    expect(
      prefillFromListing({
        title: "  ",
        category: "Audio",
        price: 0,
        marketCode: "DE"
      })
    ).toEqual({
      query: "audio",
      requirements: ""
    });
  });
});
