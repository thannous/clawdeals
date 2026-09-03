/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import { applyBuyMissionUi, clearActiveBuyMission } from "../../webmcp/ui-bridge";
import BuyMissionPanel, { describeMissionResult, prefillFromListing } from "./BuyMissionPanel";

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

  it("maps server failures to localized keys without exposing raw messages", () => {
    expect(
      describeMissionResult(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "internal validation detail" } },
        "€950"
      )
    ).toEqual({ key: "mission.result.validation", code: "VALIDATION_ERROR" });
    expect(
      describeMissionResult({ ok: false, error: { code: "INTERNAL_ERROR", message: "admin stack detail" } }, "€950")
    ).toEqual({ key: "mission.result.failed", code: "INTERNAL_ERROR" });
  });

  it("hydrates mission defaults from the authenticated owner policy", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          budgets: { preferred_offer: 875, max_offer: 950, currency: "EUR" },
          mission_defaults: {
            radius_km: 40,
            autonomous_actions: ["make_offer"]
          }
        }
      })
    } as Response);

    render(<BuyMissionPanel />);
    const form = screen.getByTestId("buy-mission-form");
    const radius = form.querySelector<HTMLInputElement>('[name="radius_km"]');
    const preferred = form.querySelector<HTMLInputElement>('[name="preferred_price_max"]');
    const hard = form.querySelector<HTMLInputElement>('[name="hard_budget_max"]');

    await waitFor(() => {
      expect(radius?.value).toBe("40");
      expect(preferred?.value).toBe("875");
      expect(hard?.value).toBe("950");
    });
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Search and rank/i
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Ask the seller/i
        }) as HTMLInputElement
      ).checked
    ).toBe(false);
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Make policy-compliant offers/i
        }) as HTMLInputElement
      ).checked
    ).toBe(true);

    fireEvent.submit(form);

    await waitFor(() => expect(executeTool).toHaveBeenCalledTimes(1));
    expect(executeTool).toHaveBeenCalledWith(
      "create_buy_mission",
      expect.objectContaining({
        radius_km: 40,
        preferred_price_max: 875,
        hard_budget_max: 950,
        autonomous_actions: ["search", "make_offer"]
      })
    );
  });

  it("exposes a declarative WebMCP form and submits through the imperative tool", async () => {
    render(<BuyMissionPanel />);
    const form = screen.getByTestId("buy-mission-form");

    expect(form.getAttribute("toolname")).toBe("prepare_buy_mission");
    expect(form.getAttribute("tooldescription")).toContain("human reviews");
    expect(screen.getByRole("textbox", { name: /What to find/i }).getAttribute("toolparamdescription")).toContain(
      "product or item"
    );

    fireEvent.submit(form);

    await waitFor(() => expect(executeTool).toHaveBeenCalledTimes(1));
    expect(executeTool).toHaveBeenCalledWith(
      "create_buy_mission",
      expect.objectContaining({
        query: "used e-bike",
        market_code: "FR",
        latitude: 48.8566,
        longitude: 2.3522,
        radius_km: 25,
        preferred_price_max: 1200,
        hard_budget_max: 1300,
        requirements: ["battery_health >= 80%"],
        autonomous_actions: ["search", "ask_question", "make_offer"],
        contact_reveal: "manual_bilateral_approval"
      })
    );
    await waitFor(() => expect(screen.getByTestId("buy-mission-result").textContent).toContain("Mission created"));
  });

  it("fills coordinates and market from a city preset and toggles autonomy with checkboxes", async () => {
    render(<BuyMissionPanel />);
    fireEvent.change(screen.getByTestId("buy-mission-city"), {
      target: { value: "london" }
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Make policy-compliant offers/i }));
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Search and rank/i
        }) as HTMLInputElement
      ).disabled
    ).toBe(true);

    fireEvent.submit(screen.getByTestId("buy-mission-form"));
    await waitFor(() => expect(executeTool).toHaveBeenCalledTimes(1));
    expect(executeTool).toHaveBeenCalledWith(
      "create_buy_mission",
      expect.objectContaining({
        market_code: "GB",
        location_label: "London",
        latitude: 51.5074,
        longitude: -0.1278,
        autonomous_actions: ["search", "ask_question"]
      })
    );
  });

  it("explains failures in plain language while keeping the code available", async () => {
    executeTool.mockResolvedValue({
      ok: false,
      error: {
        code: "USER_DENIED",
        message: "User denied tool execution",
        details: {}
      },
      meta: { request_id: "request-2" }
    });
    render(<BuyMissionPanel />);
    fireEvent.submit(screen.getByTestId("buy-mission-form"));
    await waitFor(() =>
      expect(screen.getByTestId("buy-mission-result").textContent).toContain("Confirmation declined")
    );
    expect(screen.getByTestId("buy-mission-result").getAttribute("data-code")).toBe("USER_DENIED");
  });

  it("renders the mission summary immediately after a tool updates shared UI state", async () => {
    render(<BuyMissionPanel />);
    act(() => {
      applyBuyMissionUi({
        mission_id: "mission-1",
        status: "ACTIVE",
        query: "used e-bike",
        preferred_price_max: 1200,
        hard_budget_max: 1300,
        currency: "EUR",
        requirements: ["battery_health >= 80%"],
        autonomous_actions: ["search", "make_offer"],
        contact_reveal: "manual_bilateral_approval",
        expires_at: "2026-09-02T10:00:00.000Z",
        location: { label: "Paris", lat: 48.8566, lon: 2.3522, radius_km: 25 }
      });
    });

    await waitFor(() => expect(screen.getByTestId("buy-mission-summary")).toBeTruthy());
    expect(screen.getByTestId("buy-mission-summary").textContent).toContain("used e-bike");
    expect(screen.getByTestId("buy-mission-summary").textContent).toContain("€1,300.00");
    expect(screen.getByTestId("buy-mission-summary").textContent).toContain("Bilateral approval only");
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
