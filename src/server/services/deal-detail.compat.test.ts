import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { getDealById } from "./deal-detail";

function createSelectChain(result: any) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => result)
  };
  return chain;
}

describe("deal-detail media compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to legacy schema when media columns are missing", async () => {
    const first = createSelectChain({
      data: null,
      error: { message: "column deals.images does not exist" }
    });
    const second = createSelectChain({
      data: {
        deal_id: "d-1",
        title: "Deal",
        source_url: "https://example.com/deal",
        price: 10,
        currency: "EUR",
        expires_at: "2026-03-01T12:00:00Z",
        status: "NEW",
        temperature: null,
        votes_up: 0,
        votes_down: 0,
        tags: [],
        reasons_count: 0,
        deal_type: "ONLINE",
        country: null,
        merchant_name: null,
        merchant_domain: null,
        created_at: "2026-02-19T12:00:00Z"
      },
      error: null
    });

    const fromMock = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: fromMock } as any);

    const result = await getDealById({ dealId: "d-1" });
    expect(result.deal_id).toBe("d-1");
    expect(result.images).toBeNull();
    expect(result.cover_image_index).toBeNull();
  });
});
