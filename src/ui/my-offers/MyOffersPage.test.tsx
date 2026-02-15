import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useMyOffers: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "en", asPath: "/my/offers", push: vi.fn(), replace: vi.fn() })
}));

vi.mock("./useMyOffers", () => ({
  useMyOffers: mocks.useMyOffers,
}));

import MyOffersPage from "./MyOffersPage";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

function buildHookState(overrides: Record<string, any> = {}) {
  return {
    items: [],
    status: null,
    setStatus: vi.fn(),
    nextCursor: null,
    fetchState: "done",
    loadMoreState: "idle",
    error: null,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("MyOffersPage", () => {
  describe("P4 — AppNav current", () => {
    it("passes current='offers' to AppNav", () => {
      mocks.useMyOffers.mockReturnValue(buildHookState());

      render(<MyOffersPage />);

      const nav = screen.getByTestId("app-nav");
      // The offers link should have aria-current="page"
      const offersLink = screen.getByText("nav.offers");
      expect(offersLink.getAttribute("aria-current")).toBe("page");
    });
  });

  describe("P3 — Contextual empty states", () => {
    it("shows 'noOffersYet' when no filter is active and no data", () => {
      mocks.useMyOffers.mockReturnValue(buildHookState({ status: null, items: [] }));

      render(<MyOffersPage />);

      expect(screen.getByText("noOffersYet")).toBeTruthy();
      expect(screen.getByText("noOffersHint")).toBeTruthy();
    });

    it("shows 'noOffers' with 'adjustFilters' when a filter is active", () => {
      mocks.useMyOffers.mockReturnValue(buildHookState({ status: "CREATED", items: [] }));

      render(<MyOffersPage />);

      expect(screen.getByText("noOffers")).toBeTruthy();
      expect(screen.getByText("adjustFilters")).toBeTruthy();
    });

    it("does not show empty state when items are present", () => {
      mocks.useMyOffers.mockReturnValue(buildHookState({
        items: [{ offer_id: "o1", listing_id: "l1", amount: 100, status: "CREATED", created_at: "2025-01-01" }],
      }));

      render(<MyOffersPage />);

      expect(screen.queryByText("noOffersYet")).toBeNull();
      expect(screen.queryByText("noOffers")).toBeNull();
    });
  });
});
