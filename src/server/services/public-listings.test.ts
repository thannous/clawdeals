import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./listings", () => ({
  listListings: vi.fn(),
  getListing: vi.fn(),
}));

vi.mock("./agents", () => ({
  getAgentById: vi.fn(),
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn(),
}));

vi.mock("./owners", () => ({
  getOwnerPublicProfiles: vi.fn(),
}));

import { getListing, listListings } from "./listings";
import { getAgentById } from "./agents";
import { getSupabaseServiceClient } from "../db/supabase";
import { getOwnerPublicProfiles } from "./owners";
import { getPublicListing, listPublicListings } from "./public-listings";

const listListingsMock = vi.mocked(listListings);
const getListingMock = vi.mocked(getListing);
const getAgentByIdMock = vi.mocked(getAgentById);
const getClientMock = vi.mocked(getSupabaseServiceClient);
const getOwnerProfilesMock = vi.mocked(getOwnerPublicProfiles);

describe("getPublicListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const liveRow = {
    listing_id: "lst-1",
    status: "LIVE",
    title: "Used e-bike",
    description: "Battery 88%",
    category: "mobility",
    condition: "GOOD",
    price_amount: 1150,
    currency: "EUR",
    created_at: "2026-08-01T00:00:00Z",
    owner_id: "owner-1",
    agent_id: "agent-1",
    market_code: "FR",
    geo_lat: 48.856614,
    geo_lng: 2.352222,
  };

  it("flags quarantined sellers and survives a trust lookup failure", async () => {
    getListingMock.mockResolvedValue({ ...liveRow, geo_lat: null, geo_lng: null } as any);
    getOwnerProfilesMock.mockResolvedValue(
      new Map([["owner-1", { display_name: "New seller", avatar_url: null, verified: false }]])
    );
    getAgentByIdMock.mockResolvedValueOnce({ id: "agent-1", trust_score: 10, trust_flags: ["quarantined"], created_at: null } as any);

    const quarantined = await getPublicListing("lst-1");
    expect(quarantined?.geo).toBeNull();
    expect(quarantined?.seller?.trust).toEqual({ score: 10, quarantined: true, member_since: null });

    getAgentByIdMock.mockRejectedValueOnce(new Error("db down"));
    const degraded = await getPublicListing("lst-1");
    expect(degraded?.seller).toEqual({ display_name: "New seller", avatar_url: null, verified: false, trust: null });
  });
});

describe("listPublicListings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries extra fetch without cover_image_index on legacy schema", async () => {
    const items = [
      {
        listing_id: "id-1",
        title: "Item 1",
        category: "cat",
        condition: "NEW",
        price_amount: 100,
        currency: "EUR",
        created_at: "2026-01-01T00:00:00Z"
      }
    ];
    listListingsMock.mockResolvedValue({ items, nextCursor: null });

    const inMock = vi.fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: "column listings.cover_image_index does not exist" }
      })
      .mockResolvedValueOnce({
        data: [
          {
            listing_id: "id-1",
            description: "Desc for item 1",
            owner_id: "owner-1",
            photos: [{ storage_key: "listings/id-1/1.jpg", mime: "image/jpeg" }]
          }
        ],
        error: null
      });
    const selectMock = vi.fn().mockReturnValue({ in: inMock });
    getClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({ select: selectMock }),
    } as any);

    getOwnerProfilesMock.mockResolvedValue(
      new Map([
        ["owner-1", { display_name: "Seller One", avatar_url: null, verified: true }],
      ])
    );

    const result = await listPublicListings({ sort: "recent" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe("Desc for item 1");
    expect(result.items[0].images_count).toBe(1);
    expect(result.items[0].seller).toEqual({ display_name: "Seller One", avatar_url: null, verified: true });
    expect(selectMock).toHaveBeenCalledWith("listing_id, description, owner_id, photos, cover_image_index");
    expect(selectMock).toHaveBeenCalledWith("listing_id, description, owner_id, photos");
  });
});
