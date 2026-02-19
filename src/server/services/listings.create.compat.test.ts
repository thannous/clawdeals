import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import { createListing } from "./listings";

describe("listings.create compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries without cover_image_index while keeping duplicate fields when only cover column is missing", async () => {
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
          return { data: null, error: { message: "column listings.cover_image_index does not exist" } };
        }
        return { data: { listing_id: "l-1", status: "LIVE" }, error: null };
      })
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => chain)
    } as any);

    const result = await createListing({
      title: "Listing",
      description: "Description",
      category: "misc",
      condition: "GOOD",
      status: "LIVE",
      priceAmount: 100,
      currency: "EUR",
      photos: [],
      coverImageIndex: 0,
      dealId: null,
      duplicateFingerprint: "fp-1",
      duplicateOverride: false,
      ownerId: "owner-1",
      agentId: "agent-1",
      sellerAgentId: "agent-1"
    });

    expect(result.listing_id).toBe("l-1");
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toHaveProperty("duplicate_fingerprint", "fp-1");
    expect(payloads[0]).toHaveProperty("duplicate_override", false);
    expect(payloads[0]).toHaveProperty("cover_image_index", 0);
    expect(payloads[1]).toHaveProperty("duplicate_fingerprint", "fp-1");
    expect(payloads[1]).toHaveProperty("duplicate_override", false);
    expect(payloads[1]).not.toHaveProperty("cover_image_index");
  });

  it("retries without duplicate columns while keeping cover_image_index when duplicate columns are missing", async () => {
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
          return { data: null, error: { message: "column listings.duplicate_fingerprint does not exist" } };
        }
        return { data: { listing_id: "l-1", status: "LIVE" }, error: null };
      })
    };

    vi.mocked(getSupabaseServiceClient).mockReturnValue({
      from: vi.fn(() => chain)
    } as any);

    const result = await createListing({
      title: "Listing",
      description: "Description",
      category: "misc",
      condition: "GOOD",
      status: "LIVE",
      priceAmount: 100,
      currency: "EUR",
      photos: [],
      coverImageIndex: 0,
      dealId: null,
      duplicateFingerprint: "fp-1",
      duplicateOverride: false,
      ownerId: "owner-1",
      agentId: "agent-1",
      sellerAgentId: "agent-1"
    });

    expect(result.listing_id).toBe("l-1");
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toHaveProperty("duplicate_fingerprint", "fp-1");
    expect(payloads[0]).toHaveProperty("cover_image_index", 0);
    expect(payloads[1]).not.toHaveProperty("duplicate_fingerprint");
    expect(payloads[1]).not.toHaveProperty("duplicate_override");
    expect(payloads[1]).toHaveProperty("cover_image_index", 0);
  });
});
