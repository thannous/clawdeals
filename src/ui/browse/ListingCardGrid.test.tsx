import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "en" }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      noResults: "No listings found",
      noResultsHint: "Try adjusting your filters",
      resetFilters: "Reset filters",
      error: "Failed to load listings",
      retry: "Retry",
      loading: "Loading…",
      loadMore: "Load more",
      "conditions.NEW": "New",
      "conditions.GOOD": "Good",
      seller: "Seller",
    };
    return map[key] ?? key;
  },
}));

import ListingCardGrid from "./ListingCardGrid";

const MOCK_LISTINGS = [
  {
    listing_id: "id-1",
    title: "Item One",
    description: "Desc",
    category: "electronics",
    condition: "NEW",
    price: { amount: 100, currency: "USD" },
    created_at: new Date().toISOString(),
    seller: null,
  },
  {
    listing_id: "id-2",
    title: "Item Two",
    description: null,
    category: "books",
    condition: "GOOD",
    price: { amount: 25, currency: "EUR" },
    created_at: new Date().toISOString(),
    seller: null,
  },
];

describe("ListingCardGrid", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows loading skeletons when fetchState is loading", () => {
    render(
      <ListingCardGrid
        listings={[]}
        fetchState="loading"
        loadMoreState="idle"
        error={null}
        nextCursor={null}
        onRetry={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByTestId("browse-loading")).toBeDefined();
  });

  it("shows error state with retry button", () => {
    const onRetry = vi.fn();
    render(
      <ListingCardGrid
        listings={[]}
        fetchState="error"
        loadMoreState="idle"
        error="Network error"
        nextCursor={null}
        onRetry={onRetry}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByTestId("browse-error")).toBeDefined();
    expect(screen.getByText("Network error")).toBeDefined();

    fireEvent.click(screen.getByTestId("browse-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows empty state with hint", () => {
    render(
      <ListingCardGrid
        listings={[]}
        fetchState="done"
        loadMoreState="idle"
        error={null}
        nextCursor={null}
        onRetry={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByTestId("browse-empty")).toBeDefined();
    expect(screen.getByText("No listings found")).toBeDefined();
    expect(screen.getByText("Try adjusting your filters")).toBeDefined();
  });

  it("shows reset filters button in empty state when callback provided", () => {
    const onReset = vi.fn();
    render(
      <ListingCardGrid
        listings={[]}
        fetchState="done"
        loadMoreState="idle"
        error={null}
        nextCursor={null}
        onRetry={vi.fn()}
        onLoadMore={vi.fn()}
        onResetFilters={onReset}
      />
    );
    const btn = screen.getByTestId("browse-reset-filters");
    expect(btn).toBeDefined();

    fireEvent.click(btn);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("does not show reset button when no callback", () => {
    render(
      <ListingCardGrid
        listings={[]}
        fetchState="done"
        loadMoreState="idle"
        error={null}
        nextCursor={null}
        onRetry={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.queryByTestId("browse-reset-filters")).toBeNull();
  });

  it("renders listing cards in a grid", () => {
    render(
      <ListingCardGrid
        listings={MOCK_LISTINGS}
        fetchState="done"
        loadMoreState="idle"
        error={null}
        nextCursor={null}
        onRetry={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByTestId("browse-grid")).toBeDefined();
    expect(screen.getByText("Item One")).toBeDefined();
    expect(screen.getByText("Item Two")).toBeDefined();
  });

  it("shows load more button when nextCursor exists", () => {
    const onLoadMore = vi.fn();
    render(
      <ListingCardGrid
        listings={MOCK_LISTINGS}
        fetchState="done"
        loadMoreState="idle"
        error={null}
        nextCursor="some-cursor"
        onRetry={vi.fn()}
        onLoadMore={onLoadMore}
      />
    );
    const btn = screen.getByTestId("browse-load-more");
    expect(btn).toBeDefined();
    expect(btn.textContent).toContain("Load more");

    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("hides load more button when no nextCursor", () => {
    render(
      <ListingCardGrid
        listings={MOCK_LISTINGS}
        fetchState="done"
        loadMoreState="idle"
        error={null}
        nextCursor={null}
        onRetry={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.queryByTestId("browse-load-more")).toBeNull();
  });

  it("shows loading state on load more button", () => {
    render(
      <ListingCardGrid
        listings={MOCK_LISTINGS}
        fetchState="done"
        loadMoreState="loading"
        error={null}
        nextCursor="some-cursor"
        onRetry={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    const btn = screen.getByTestId("browse-load-more");
    expect(btn.textContent).toContain("Loading");
  });
});
