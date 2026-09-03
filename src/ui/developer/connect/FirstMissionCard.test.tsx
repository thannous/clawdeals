import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));

import FirstMissionCard from "./FirstMissionCard";

describe("FirstMissionCard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("links to a prefilled mission on the latest live listing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ listing_id: "lst-1", title: "Used e-bike", category: "mobility", price: { amount: 1150, currency: "EUR" }, market_code: "FR" }]
        })
      })
    );

    render(<FirstMissionCard localePrefix="/fr" />);

    await waitFor(() => expect(screen.getByText("step.firstwin.firstMission.readyDesc:Used e-bike")).toBeTruthy());
    const cta = screen.getByTestId("first-mission-cta");
    expect(cta.getAttribute("href")).toContain("/fr/webmcp?listing=lst-1");
    expect(cta.getAttribute("href")).toContain("price=1150");
    expect(cta.textContent).toContain("step.firstwin.firstMission.cta");
  });

  it("falls back to the marketplace when no listing is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<FirstMissionCard />);

    await waitFor(() => expect(screen.getByText("step.firstwin.firstMission.browseDesc")).toBeTruthy());
    expect(screen.getByTestId("first-mission-cta").getAttribute("href")).toBe("/browse");
  });
});
