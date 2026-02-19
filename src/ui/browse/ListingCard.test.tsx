import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "en" }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      "conditions.NEW": "New",
      "conditions.LIKE_NEW": "Like New",
      "conditions.GOOD": "Good",
      "conditions.FAIR": "Fair",
      "conditions.POOR": "Poor",
      seller: "Seller",
      viewListing: "View Listing",
    };
    return map[key] ?? key;
  },
}));

import ListingCard from "./ListingCard";

function makeListing(overrides: Record<string, unknown> = {}) {
  return {
    listing_id: "test-id-1",
    title: "Test Listing Title",
    description: "A short description of the item",
    category: "electronics",
    condition: "NEW",
    price: { amount: 49.99, currency: "USD" },
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1h ago
    seller: null,
    ...overrides,
  };
}

describe("ListingCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders title, category, condition, price", () => {
    render(<ListingCard listing={makeListing()} />);

    expect(screen.getByText("Test Listing Title")).toBeDefined();
    expect(screen.getByText("Electronics")).toBeDefined(); // capitalized
    expect(screen.getByText("New")).toBeDefined(); // translated condition
    expect(screen.getByText("$49.99")).toBeDefined();
  });

  it("renders description when present", () => {
    render(<ListingCard listing={makeListing()} />);
    expect(screen.getByText("A short description of the item")).toBeDefined();
  });

  it("does not render description when null", () => {
    render(<ListingCard listing={makeListing({ description: null })} />);
    expect(screen.queryByText("A short description of the item")).toBeNull();
  });

  it("renders cover image when provided", () => {
    render(
      <ListingCard
        listing={makeListing({
          cover_image: { storage_key: "https://cdn.example.com/listings/test.jpg", mime: "image/jpeg" }
        })}
      />
    );
    expect(screen.getByAltText("Test Listing Title")).toBeDefined();
  });

  it("capitalizes category", () => {
    render(<ListingCard listing={makeListing({ category: "books" })} />);
    expect(screen.getByText("Books")).toBeDefined();
  });

  it("renders translated condition labels", () => {
    render(<ListingCard listing={makeListing({ condition: "LIKE_NEW" })} />);
    expect(screen.getByText("Like New")).toBeDefined();
  });

  it("handles missing condition gracefully", () => {
    render(<ListingCard listing={makeListing({ condition: null })} />);
    // Should not crash, condition badge should be empty
    expect(screen.getByText("Test Listing Title")).toBeDefined();
  });

  it("formats time ago correctly", () => {
    // 1 hour ago → "1h"
    render(<ListingCard listing={makeListing()} />);
    expect(screen.getByText("1h")).toBeDefined();
  });

  it("renders seller info when present", () => {
    const seller = { display_name: "John Doe", avatar_url: "/avatar.png", verified: true };
    render(<ListingCard listing={makeListing({ seller })} />);
    expect(screen.getByText("John Doe")).toBeDefined();
  });

  it("renders default seller text when seller has no name", () => {
    const seller = { display_name: null, avatar_url: null, verified: false };
    render(<ListingCard listing={makeListing({ seller })} />);
    expect(screen.getByText("Seller")).toBeDefined();
  });

  it("does not render seller section when seller is null", () => {
    render(<ListingCard listing={makeListing({ seller: null })} />);
    expect(screen.queryByText("Seller")).toBeNull();
  });
});
