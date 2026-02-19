import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { listListings, listListingsByOwner, updateListingBySeller } from "./listings";

describe("listings media compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listListings retries media enrichment without cover_image_index on legacy schema", async () => {
    const selectCalls: string[] = [];

    const client: any = {
      rpc: vi.fn(async () => ({
        data: [
          {
            listing_id: "l-1",
            title: "Listing",
            category: "misc",
            condition: "GOOD",
            price_amount: 100,
            currency: "EUR",
            status: "LIVE",
            delivery_method: "MEETUP",
            created_at: "2026-02-19T12:00:00Z"
          }
        ],
        error: null
      })),
      from: vi.fn(() => ({
        select: vi.fn((columns: string) => {
          selectCalls.push(columns);
          return {
            in: vi.fn(async () => {
              if (columns.includes("cover_image_index")) {
                return { data: null, error: { message: "column listings.cover_image_index does not exist" } };
              }
              return {
                data: [
                  {
                    listing_id: "l-1",
                    photos: [{ storage_key: "listings/l-1/1.jpg", mime: "image/jpeg" }]
                  }
                ],
                error: null
              };
            })
          };
        })
      }))
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const result = await listListings({ sort: "recent", limit: 24, includeHidden: false });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].images_count).toBe(1);
    expect(result.items[0].cover_image?.storage_key).toBe("listings/l-1/1.jpg");
    expect(selectCalls).toEqual(["listing_id,photos,cover_image_index", "listing_id,photos"]);
  });

  it("listListingsByOwner retries without cover_image_index on legacy schema", async () => {
    let resolveIndex = 0;
    const queryResults = [
      { data: null, error: { message: "column listings.cover_image_index does not exist" } },
      {
        data: [
          {
            listing_id: "l-1",
            title: "Listing",
            category: "misc",
            condition: "GOOD",
            price_amount: 100,
            currency: "EUR",
            status: "LIVE",
            delivery_method: "MEETUP",
            photos: [{ storage_key: "listings/l-1/1.jpg", mime: "image/jpeg" }],
            created_at: "2026-02-19T12:00:00Z",
            updated_at: "2026-02-19T12:01:00Z",
            seller_agent_id: "agent-1"
          }
        ],
        error: null
      }
    ];

    const listingsChain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: any) => resolve(queryResults[resolveIndex++]))
    };

    const client: any = {
      from: vi.fn(() => listingsChain)
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const result = await listListingsByOwner({ ownerId: "owner-1" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].images_count).toBe(1);
    expect(result.items[0].cover_image?.storage_key).toBe("listings/l-1/1.jpg");
    expect(listingsChain.select).toHaveBeenCalledWith(
      "listing_id,title,category,condition,price_amount,currency,status,delivery_method,photos,cover_image_index,created_at,updated_at,seller_agent_id"
    );
    expect(listingsChain.select).toHaveBeenCalledWith(
      "listing_id,title,category,condition,price_amount,currency,status,delivery_method,photos,created_at,updated_at,seller_agent_id"
    );
  });

  it("updateListingBySeller retries without cover_image_index on legacy schema", async () => {
    const payloads: any[] = [];
    let resolveIndex = 0;
    const queryResults = [
      { data: null, error: { message: "column listings.cover_image_index does not exist" } },
      {
        data: {
          listing_id: "l-1",
          status: "DRAFT",
          delivery_method: "MEETUP",
          photos: [{ storage_key: "listings/l-1/1.jpg", mime: "image/jpeg" }],
          updated_at: "2026-02-19T12:01:00Z"
        },
        error: null
      }
    ];

    const listingsChain: any = {
      update: vi.fn((payload: any) => {
        payloads.push(payload);
        return listingsChain;
      }),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => queryResults[resolveIndex++])
    };

    const client: any = {
      from: vi.fn(() => listingsChain)
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const result = await updateListingBySeller({
      listingId: "l-1",
      sellerAgentId: "agent-1",
      expectedStatus: "DRAFT",
      patch: { cover_image_index: 0 }
    });

    expect(result?.cover_image_index).toBeNull();
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toHaveProperty("cover_image_index", 0);
    expect(payloads[1]).not.toHaveProperty("cover_image_index");
    expect(listingsChain.select).toHaveBeenCalledWith("listing_id,status,delivery_method,photos,cover_image_index,updated_at");
    expect(listingsChain.select).toHaveBeenCalledWith("listing_id,status,delivery_method,photos,updated_at");
  });
});
