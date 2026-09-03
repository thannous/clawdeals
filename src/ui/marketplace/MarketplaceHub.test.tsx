import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LAUNCH_MARKETS } from "../../shared/markets";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  )
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "en" })
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key === "country.all" ? "All" : key
}));

vi.mock("../../theme/theme-context", () => ({
  useTheme: () => ({
    themeId: "neo",
    setTheme: vi.fn(),
    themes: [{ id: "neo", label: "Neo" }]
  })
}));

vi.mock("../landing/Navbar", () => ({
  NavbarCurrent: () => null
}));

vi.mock("../seo/LocalizedMarketContext", () => ({
  default: () => null
}));

import MarketplaceHub from "./MarketplaceHub";

describe("MarketplaceHub market selector", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows only All and the configured FR, GB, and ES markets with native currencies", () => {
    render(<MarketplaceHub />);

    expect(screen.getAllByRole("button")).toHaveLength(1 + LAUNCH_MARKETS.length);
    expect(screen.getByTestId("country-chip-all").textContent).toBe("All");
    expect(
      LAUNCH_MARKETS.map(({ code }) => screen.getByTestId(`country-chip-${code}`).textContent)
    ).toEqual([
      expect.stringContaining("FR · EUR"),
      expect.stringContaining("GB · GBP"),
      expect.stringContaining("ES · EUR")
    ]);

    for (const unsupportedCode of ["BE", "DE", "US"]) {
      expect(screen.queryByTestId(`country-chip-${unsupportedCode}`)).toBeNull();
    }
    expect(screen.queryByTestId("country-chip-worldwide")).toBeNull();
    expect(screen.queryByTestId("country-more-btn")).toBeNull();
  });

  it.each(LAUNCH_MARKETS)("links both marketplace sections to the $code filter", ({ code }) => {
    render(<MarketplaceHub />);

    fireEvent.click(screen.getByTestId(`country-chip-${code}`));

    expect(screen.getByTestId("marketplace-card-listings").getAttribute("href"))
      .toBe(`/browse?country=${code}`);
    expect(screen.getByTestId("marketplace-card-deals").getAttribute("href"))
      .toBe(`/browse/deals?country=${code}`);
  });

  it("drops a persisted market that is no longer publicly supported", async () => {
    localStorage.setItem("clawdeals:country", "US");

    render(<MarketplaceHub />);

    await waitFor(() => {
      expect(localStorage.getItem("clawdeals:country")).toBeNull();
    });
    expect(screen.getByTestId("country-chip-all").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("marketplace-card-listings").getAttribute("href")).toBe("/browse");
    expect(screen.getByTestId("marketplace-card-deals").getAttribute("href")).toBe("/browse/deals");
  });
});
