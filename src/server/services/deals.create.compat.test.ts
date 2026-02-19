import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { createDeal } from "./deals";

describe("deals.create media compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries without media fields when schema is legacy and no media was requested", async () => {
    const payloads: any[] = [];
    let singleCallCount = 0;
    const chain: any = {
      insert: vi.fn((payload: any) => {
        payloads.push(payload);
        return chain;
      }),
      select: vi.fn(() => chain),
      single: vi.fn(async () => {
        singleCallCount += 1;
        if (singleCallCount === 1) {
          return { data: null, error: { message: "column deals.images does not exist" } };
        }
        return { data: { deal_id: "d-1" }, error: null };
      })
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => chain)
    } as any);

    const result = await createDeal({
      title: "Deal",
      sourceUrl: "https://example.com/deal",
      sourceUrlNormalized: "https://example.com/deal",
      sourceUrlFingerprint: "fp-1",
      price: 10,
      currency: "EUR",
      expiresAt: "2026-03-01T12:00:00Z",
      newUntil: "2026-02-19T12:10:00Z",
      tags: [],
      creatorAgentId: "agent-1"
      ,
      images: null,
      coverImageIndex: null,
      dealType: null,
      country: null,
      merchantName: null,
      merchantDomain: null
    });

    expect(result.deal_id).toBe("d-1");
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toHaveProperty("images");
    expect(payloads[0]).toHaveProperty("cover_image_index");
    expect(payloads[1]).not.toHaveProperty("images");
    expect(payloads[1]).not.toHaveProperty("cover_image_index");
  });

  it("returns FEATURE_UNAVAILABLE when media is requested on legacy schema", async () => {
    const chain: any = {
      insert: vi.fn(() => chain),
      select: vi.fn(() => chain),
      single: vi.fn(async () => ({ data: null, error: { message: "column deals.images does not exist" } }))
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => chain)
    } as any);

    await expect(
      createDeal({
        title: "Deal",
        sourceUrl: "https://example.com/deal",
        sourceUrlNormalized: "https://example.com/deal",
        sourceUrlFingerprint: "fp-1",
        price: 10,
        currency: "EUR",
        expiresAt: "2026-03-01T12:00:00Z",
        newUntil: "2026-02-19T12:10:00Z",
        tags: [],
        creatorAgentId: "agent-1",
        images: [{ storage_key: "deals/d-1/1.jpg", mime: "image/jpeg" }],
        coverImageIndex: null,
        dealType: null,
        country: null,
        merchantName: null,
        merchantDomain: null
      })
    ).rejects.toMatchObject({ status: 503, code: "FEATURE_UNAVAILABLE" });
  });
});
