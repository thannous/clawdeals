import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { listDeals, listDealsByOwner } from "./deals-list";

describe("deals-list media compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listDeals returns rows with default media fields when deals media columns are missing", async () => {
    const mediaLookupChain: any = {
      in: vi.fn(async () => ({
        data: null,
        error: { message: "column deals.images does not exist" }
      }))
    };

    const client: any = {
      rpc: vi.fn(async () => ({
        data: [
          {
            deal_id: "d-1",
            title: "Deal",
            status: "NEW",
            created_at: "2026-02-19T12:00:00Z"
          }
        ],
        error: null
      })),
      from: vi.fn(() => ({
        select: vi.fn(() => mediaLookupChain)
      }))
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const result = await listDeals({ sort: "new", limit: 24, includeHidden: false });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].images_count).toBe(0);
    expect(result.items[0].cover_image).toBeNull();
  });

  it("listDealsByOwner retries without media columns when schema is legacy", async () => {
    const agentsChain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn(async () => ({ data: [{ id: "agent-1" }], error: null }))
    };

    let resolveIndex = 0;
    const dealQueryResults = [
      { data: null, error: { message: "column deals.images does not exist" } },
      {
        data: [
          {
            deal_id: "d-1",
            title: "Deal",
            status: "NEW",
            temperature: null,
            price: 10,
            currency: "EUR",
            created_at: "2026-02-19T12:00:00Z",
            creator_agent_id: "agent-1"
          }
        ],
        error: null
      }
    ];

    const dealsChain: any = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: any) => resolve(dealQueryResults[resolveIndex++]))
    };

    const client: any = {
      from: vi.fn((table: string) => {
        if (table === "agents") return agentsChain;
        if (table === "deals") return dealsChain;
        throw new Error(`Unexpected table: ${table}`);
      })
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue(client);

    const result = await listDealsByOwner({ ownerId: "owner-1" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].images_count).toBe(0);
    expect(result.items[0].cover_image).toBeNull();
    expect(dealsChain.select).toHaveBeenCalledWith(
      "deal_id,title,status,temperature,price,currency,market_code,images,cover_image_index,created_at,creator_agent_id"
    );
    expect(dealsChain.select).toHaveBeenCalledWith(
      "deal_id,title,status,temperature,price,currency,market_code,created_at,creator_agent_id"
    );
  });
});
