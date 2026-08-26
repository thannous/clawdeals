import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../http", () => ({
  callPublicWebmcp: vi.fn()
}));

vi.mock("../ui-bridge", () => ({
  applyDealsSearchUi: vi.fn(),
  applyListingsSearchUi: vi.fn(),
  applyOpenDealUi: vi.fn(),
  applyOpenListingUi: vi.fn(),
  getPageContext: vi.fn(() => ({ path: "/browse" }))
}));

import { callPublicWebmcp } from "../http";
import { collabTools } from "./collab-tools";

describe("public collaboration tools", () => {
  beforeEach(() => {
    vi.mocked(callPublicWebmcp).mockReset();
  });

  it.each(["search_listings", "search_deals"])(
    "%s exposes a maximum of five results and marks them untrusted",
    async (name) => {
      const tool = collabTools.find((candidate) => candidate.name === name)!;
      const idKey = name === "search_listings" ? "listing_id" : "deal_id";
      vi.mocked(callPublicWebmcp).mockResolvedValue({
        ok: true,
        data: {
          data: Array.from({ length: 8 }, (_, index) => ({
            [idKey]: `id-${index}`,
            title: `Item ${index}`
          })),
          next_cursor: "next"
        },
        meta: { request_id: "req-public" }
      } as any);

      expect((tool.inputJsonSchema as any).properties.limit.maximum).toBe(5);
      expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });

      const result = await tool.execute(
        {},
        { requestId: "req-public", idempotencyKey: null }
      );

      expect(result.ok).toBe(true);
      if (result.ok) expect((result.data as any).items).toHaveLength(5);
      expect(callPublicWebmcp).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.objectContaining({ limit: 5 }) })
      );
    }
  );

  it("ranks listing summaries with transparent trust and mission policy fit", async () => {
    const tool = collabTools.find((candidate) => candidate.name === "search_listings")!;
    vi.mocked(callPublicWebmcp).mockResolvedValue({
      ok: true,
      data: {
        data: [
          {
            listing_id: "over-hard",
            title: "Too expensive",
            price: { amount: 1400, currency: "EUR" },
            distance_km: 7,
            seller: { verified: true }
          },
          {
            listing_id: "fit",
            title: "Good fit",
            price: { amount: 1200, currency: "EUR" },
            distance_km: 14.2,
            seller: { verified: true }
          }
        ],
        next_cursor: null
      },
      meta: { request_id: "req-ranked" }
    } as any);

    const result = await tool.execute(
      {
        latitude: 48.8566,
        longitude: 2.3522,
        radius_km: 25,
        preferred_price_max: 1200,
        hard_budget_max: 1300,
        requirements: ["battery_health >= 80%"]
      },
      { requestId: "req-ranked", idempotencyKey: null }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const items = (result.data as any).items;
    expect(items[0]).toMatchObject({
      listing_id: "fit",
      distance_km: 14.2,
      trust: { level: "medium", reasons: ["seller_profile_verified"] },
      policy_fit: {
        eligible: true,
        issues: ["requirements_need_seller_confirmation"]
      },
      url: "/browse/fit"
    });
    expect(items[1].policy_fit).toEqual({
      eligible: false,
      issues: ["price_above_hard_budget", "requirements_need_seller_confirmation"]
    });
    expect(callPublicWebmcp).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          sort: "distance",
          lat: 48.8566,
          lng: 2.3522,
          distance_km: 25,
          limit: 5
        })
      })
    );
  });

  it("rejects incomplete geo and inverted mission budgets", () => {
    const tool = collabTools.find((candidate) => candidate.name === "search_listings")!;

    expect(tool.zodSchema.safeParse({ latitude: 48.8 }).success).toBe(false);
    expect(
      tool.zodSchema.safeParse({ preferred_price_max: 1400, hard_budget_max: 1300 }).success
    ).toBe(false);
  });
});
