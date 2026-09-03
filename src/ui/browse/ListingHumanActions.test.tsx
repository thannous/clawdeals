import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import ListingHumanActions, { buildAskMyAgentHref } from "./ListingHumanActions";
import { getFollowedListingIds } from "./followed-listings";

const listing = {
  listing_id: "90000000-0000-4000-8000-000000000001",
  title: "Used e-bike urban commute - battery health 88%",
  category: "mobility",
  price: { amount: 1150, currency: "EUR" },
  market_code: "FR",
  geo: { lat: 48.86, lng: 2.35 }
};

describe("buildAskMyAgentHref", () => {
  it("carries only public listing fields into the mission prefill query", () => {
    const href = buildAskMyAgentHref("/fr", listing);
    const url = new URL(href, "https://clawdeals.com");
    expect(url.pathname).toBe("/fr/webmcp");
    expect(url.hash).toBe("#buy-mission");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      listing: listing.listing_id,
      title: listing.title,
      category: "mobility",
      price: "1150",
      currency: "EUR",
      market: "FR",
      lat: "48.86",
      lng: "2.35"
    });
  });

  it("omits geo and market when the listing has none", () => {
    const href = buildAskMyAgentHref("", { listing_id: "x", title: "Lamp", price: { amount: 20, currency: "GBP" } });
    const url = new URL(href, "https://clawdeals.com");
    expect(url.pathname).toBe("/webmcp");
    expect(url.searchParams.has("lat")).toBe(false);
    expect(url.searchParams.has("market")).toBe(false);
  });
});

describe("ListingHumanActions", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the three human actions and links Ask my agent to the prefilled mission", () => {
    render(<ListingHumanActions listing={listing} localePrefix="" />);
    const ask = screen.getByTestId("listing-ask-agent");
    expect(ask.getAttribute("href")).toContain("/webmcp?listing=");
    expect(screen.getByTestId("listing-follow").textContent).toContain("actions.follow");
    expect(screen.getByTestId("listing-share").textContent).toContain("actions.share");
  });

  it("toggles follow state and persists it in localStorage", () => {
    render(<ListingHumanActions listing={listing} localePrefix="" />);
    const follow = screen.getByTestId("listing-follow");

    fireEvent.click(follow);
    expect(follow.getAttribute("aria-pressed")).toBe("true");
    expect(follow.textContent).toContain("actions.following");
    expect(getFollowedListingIds()).toEqual([listing.listing_id]);

    fireEvent.click(follow);
    expect(follow.getAttribute("aria-pressed")).toBe("false");
    expect(getFollowedListingIds()).toEqual([]);
  });

  it("copies the page URL when the Web Share API is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });

    render(<ListingHumanActions listing={listing} localePrefix="" />);
    fireEvent.click(screen.getByTestId("listing-share"));

    await screen.findByText("actions.linkCopied");
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });
});
