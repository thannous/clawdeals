import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./listings", () => ({
  listListings: vi.fn(),
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn(),
}));

vi.mock("./owners", () => ({
  getOwnerPublicProfiles: vi.fn(),
}));

import { listListings } from "./listings";
import { getSupabaseServiceClient } from "../db/supabase";
import { getOwnerPublicProfiles } from "./owners";
import { mapPublicListingRow, listPublicListings } from "./public-listings";

const listListingsMock = vi.mocked(listListings);
const getClientMock = vi.mocked(getSupabaseServiceClient);
const getOwnerProfilesMock = vi.mocked(getOwnerPublicProfiles);

describe("mapPublicListingRow", () => {
  it("maps a full row with all fields", () => {
    const row = {
      listing_id: "abc-123",
      title: "Test Item",
      description: "A short description",
      category: "electronics",
      condition: "NEW",
      price_amount: 1999,
      currency: "EUR",
      created_at: "2026-01-01T00:00:00Z",
    };
    const result = mapPublicListingRow(row);
    expect(result).toEqual({
      listing_id: "abc-123",
      title: "Test Item",
      description: "A short description",
      category: "electronics",
      condition: "NEW",
      price: { amount: 1999, currency: "EUR" },
      created_at: "2026-01-01T00:00:00Z",
      seller: null,
    });
  });

  it("truncates description longer than 200 chars", () => {
    const longDesc = "A".repeat(250);
    const row = {
      listing_id: "abc-123",
      title: "Long",
      description: longDesc,
      category: "books",
      condition: "GOOD",
      price_amount: 500,
      currency: "USD",
      created_at: "2026-01-01T00:00:00Z",
    };
    const result = mapPublicListingRow(row);
    expect(result.description).toHaveLength(201); // 200 + ellipsis char
    expect(result.description!.endsWith("…")).toBe(true);
  });

  it("returns null description when missing", () => {
    const row = {
      listing_id: "abc-123",
      title: "No Desc",
      description: null,
      category: "other",
      condition: "FAIR",
      price_amount: 0,
      currency: "USD",
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(mapPublicListingRow(row).description).toBeNull();
  });

  it("returns null description for non-string values", () => {
    const row = {
      listing_id: "abc-123",
      title: "Bad Desc",
      description: 12345,
      category: "other",
      condition: "FAIR",
      price_amount: 0,
      currency: "USD",
      created_at: "2026-01-01T00:00:00Z",
    };
    expect(mapPublicListingRow(row).description).toBeNull();
  });

  it("includes seller info when provided", () => {
    const row = {
      listing_id: "abc-123",
      title: "With Seller",
      description: null,
      category: "other",
      condition: "NEW",
      price_amount: 100,
      currency: "EUR",
      created_at: "2026-01-01T00:00:00Z",
    };
    const seller = { display_name: "John", avatar_url: "/avatar.png", verified: true };
    const result = mapPublicListingRow(row, seller);
    expect(result.seller).toEqual(seller);
  });
});

describe("listPublicListings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no listings found", async () => {
    listListingsMock.mockResolvedValue({ items: [], nextCursor: null });

    const result = await listPublicListings({});
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("caps limit to PUBLIC_MAX_LIMIT (30)", async () => {
    listListingsMock.mockResolvedValue({ items: [], nextCursor: null });

    await listPublicListings({ limit: 100 });
    expect(listListingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 30 })
    );
  });

  it("ensures limit is at least 1", async () => {
    listListingsMock.mockResolvedValue({ items: [], nextCursor: null });

    await listPublicListings({ limit: -5 });
    expect(listListingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 })
    );
  });

  it("enriches items with description and seller profiles", async () => {
    const items = [
      { listing_id: "id-1", title: "Item 1", category: "cat", condition: "NEW", price_amount: 100, currency: "EUR", created_at: "2026-01-01T00:00:00Z" },
      { listing_id: "id-2", title: "Item 2", category: "cat", condition: "GOOD", price_amount: 200, currency: "USD", created_at: "2026-01-02T00:00:00Z" },
    ];
    listListingsMock.mockResolvedValue({ items, nextCursor: "cursor-abc" });

    const selectMock = vi.fn().mockReturnThis();
    const inMock = vi.fn().mockResolvedValue({
      data: [
        { listing_id: "id-1", description: "Desc for item 1", owner_id: "owner-1" },
        { listing_id: "id-2", description: null, owner_id: "owner-2" },
      ],
    });
    getClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: selectMock, in: inMock }),
    } as any);
    // Fix chainable mock
    selectMock.mockReturnValue({ in: inMock });

    getOwnerProfilesMock.mockResolvedValue(
      new Map([
        ["owner-1", { display_name: "Seller One", avatar_url: null, verified: true }],
      ])
    );

    const result = await listPublicListings({ sort: "recent" });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].description).toBe("Desc for item 1");
    expect(result.items[0].seller).toEqual({ display_name: "Seller One", avatar_url: null, verified: true });
    expect(result.items[1].description).toBeNull();
    expect(result.items[1].seller).toBeNull();
    expect(result.nextCursor).toBe("cursor-abc");
  });

  it("passes includeHidden: false to listListings", async () => {
    listListingsMock.mockResolvedValue({ items: [], nextCursor: null });

    await listPublicListings({ q: "test", category: "books", condition: "NEW" });
    expect(listListingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "test",
        category: "books",
        condition: "NEW",
        includeHidden: false,
      })
    );
  });

  it("handles null extraRows gracefully", async () => {
    const items = [
      { listing_id: "id-1", title: "Item 1", category: "cat", condition: "NEW", price_amount: 100, currency: "EUR", created_at: "2026-01-01T00:00:00Z" },
    ];
    listListingsMock.mockResolvedValue({ items, nextCursor: null });

    const selectMock = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: null }),
    });
    getClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: selectMock }),
    } as any);

    getOwnerProfilesMock.mockResolvedValue(new Map());

    const result = await listPublicListings({});
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBeNull();
    expect(result.items[0].seller).toBeNull();
  });
});
