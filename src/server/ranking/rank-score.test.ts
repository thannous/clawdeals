import { describe, expect, it } from "vitest";

import {
  computeDealRankScoreV1,
  computeListingRankScoreV1,
  compareByRankCreatedAtIdDesc
} from "./rank-score";

describe("rank score v1", () => {
  it("computes deal rank score (monotonicity + penalties)", () => {
    const asOf = "2026-02-09T12:00:00Z";

    const hotRecent = computeDealRankScoreV1({
      asOf,
      createdAt: "2026-02-09T11:55:00Z",
      activeAt: "2026-02-09T11:55:00Z",
      temperature: 90,
      duplicateRank: 1,
      hidden: false
    })!;

    const hotOld = computeDealRankScoreV1({
      asOf,
      createdAt: "2026-02-08T12:00:00Z",
      activeAt: "2026-02-08T12:00:00Z",
      temperature: 90,
      duplicateRank: 1,
      hidden: false
    })!;

    const coldRecent = computeDealRankScoreV1({
      asOf,
      createdAt: "2026-02-09T11:55:00Z",
      activeAt: "2026-02-09T11:55:00Z",
      temperature: 10,
      duplicateRank: 1,
      hidden: false
    })!;

    const duplicateRecent = computeDealRankScoreV1({
      asOf,
      createdAt: "2026-02-09T11:55:00Z",
      activeAt: "2026-02-09T11:55:00Z",
      temperature: 90,
      duplicateRank: 2,
      hidden: false
    })!;

    const hiddenRecent = computeDealRankScoreV1({
      asOf,
      createdAt: "2026-02-09T11:55:00Z",
      activeAt: "2026-02-09T11:55:00Z",
      temperature: 90,
      duplicateRank: 1,
      hidden: true
    })!;

    expect(hotRecent).toBeGreaterThan(hotOld);
    expect(hotRecent).toBeGreaterThan(coldRecent);
    expect(duplicateRecent).toBeLessThan(hotRecent);
    expect(hiddenRecent).toBeLessThan(duplicateRecent);
  });

  it("computes listing rank score (recency + trust band + optional price fit)", () => {
    const asOf = "2026-02-09T12:00:00Z";

    const base = computeListingRankScoreV1({
      asOf,
      createdAt: "2026-02-09T11:55:00Z",
      priceAmount: 100,
      sellerTrustScore: 10,
      sellerTrustFlags: [],
      hidden: false
    })!;

    const trusted = computeListingRankScoreV1({
      asOf,
      createdAt: "2026-02-09T11:55:00Z",
      priceAmount: 100,
      sellerTrustScore: 90,
      sellerTrustFlags: [],
      hidden: false
    })!;

    const restricted = computeListingRankScoreV1({
      asOf,
      createdAt: "2026-02-09T11:55:00Z",
      priceAmount: 100,
      sellerTrustScore: 90,
      sellerTrustFlags: ["restricted"],
      hidden: false
    })!;

    const withPriceFit = computeListingRankScoreV1({
      asOf,
      createdAt: "2026-02-09T11:55:00Z",
      priceAmount: 100,
      priceMin: 50,
      priceMax: 150,
      sellerTrustScore: 10,
      sellerTrustFlags: [],
      hidden: false
    })!;

    const hidden = computeListingRankScoreV1({
      asOf,
      createdAt: "2026-02-09T11:55:00Z",
      priceAmount: 100,
      sellerTrustScore: 90,
      sellerTrustFlags: [],
      hidden: true
    })!;

    expect(trusted).toBeGreaterThan(base);
    expect(restricted).toBeLessThan(base);
    expect(withPriceFit).toBeGreaterThan(base);
    expect(hidden).toBeLessThan(restricted);
  });

  it("sorts stably by rank_score then created_at then id", () => {
    const rows = [
      { id: "b", created_at: "2026-02-09T10:00:00Z", rank_score: 100 },
      { id: "a", created_at: "2026-02-09T10:00:00Z", rank_score: 100 },
      { id: "c", created_at: "2026-02-09T11:00:00Z", rank_score: 100 },
      { id: "d", created_at: "2026-02-09T11:00:00Z", rank_score: 99 }
    ];
    const sorted = [...rows].sort(compareByRankCreatedAtIdDesc);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a", "d"]);
  });
});

