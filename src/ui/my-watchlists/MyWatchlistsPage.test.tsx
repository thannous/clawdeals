import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useMyWatchlists: vi.fn()
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "en", asPath: "/my/watchlists" })
}));

vi.mock("./useMyWatchlists", () => ({
  useMyWatchlists: mocks.useMyWatchlists
}));

import MyWatchlistsPage from "./MyWatchlistsPage";

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    state: "done",
    error: null,
    removingId: null,
    load: vi.fn(),
    remove: vi.fn(),
    ...overrides
  };
}

describe("MyWatchlistsPage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows signed-in listing follows and marks the Watchlist navigation item active", () => {
    mocks.useMyWatchlists.mockReturnValue(hookState({
      items: [{
        watchlist_id: "watchlist-1",
        listing_id: "listing-1",
        title: "Paris bike",
        market_code: "FR",
        currency: "EUR",
        last_price: 1150
      }]
    }));

    render(<MyWatchlistsPage />);

    expect(screen.getByText("Paris bike").closest("a")?.getAttribute("href")).toBe("/browse/listing-1");
    expect(screen.getByText("nav.watchlists").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText(/lastSeenPrice:/)).toBeTruthy();
  });

  it("removes a server follow from the account page", () => {
    const remove = vi.fn();
    mocks.useMyWatchlists.mockReturnValue(hookState({
      items: [{
        watchlist_id: "watchlist-1",
        listing_id: "listing-1",
        title: "Paris bike",
        market_code: "FR",
        currency: "EUR",
        last_price: 1150
      }],
      remove
    }));

    render(<MyWatchlistsPage />);
    fireEvent.click(screen.getByRole("button", { name: "remove" }));

    expect(remove).toHaveBeenCalledWith("watchlist-1");
  });
});
