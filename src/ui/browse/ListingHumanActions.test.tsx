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

const { sessionGateMock } = vi.hoisted(() => ({ sessionGateMock: vi.fn() }));

vi.mock("../auth/useOwnerSessionGate", () => ({
  useOwnerSessionGate: () => sessionGateMock()
}));

import ListingHumanActions from "./ListingHumanActions";
import { getFollowedListingIds } from "./followed-listings";

const listing = {
  listing_id: "90000000-0000-4000-8000-000000000001",
  title: "Used e-bike urban commute - battery health 88%",
  category: "mobility",
  price: { amount: 1150, currency: "EUR" },
  market_code: "FR",
  geo: { lat: 48.86, lng: 2.35 }
};


describe("ListingHumanActions", () => {
  beforeEach(() => {
    window.localStorage.clear();
    sessionGateMock.mockReturnValue("anonymous");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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
});
