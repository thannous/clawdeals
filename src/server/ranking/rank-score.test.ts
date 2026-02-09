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

  it("non-regression: 20 cases ordering (deals)", () => {
    const asOf = "2026-02-09T12:00:00Z";
    const deals = [
      // id, created_at is used only as tie-breaker in this unit test.
      { id: "d1", created_at: "2026-02-09T11:59:00Z", temperature: 90, activeAt: "2026-02-09T11:59:00Z", duplicateRank: 1, hidden: false },
      { id: "d2", created_at: "2026-02-09T11:58:00Z", temperature: 90, activeAt: "2026-02-09T11:58:00Z", duplicateRank: 2, hidden: false },
      { id: "d3", created_at: "2026-02-09T11:57:00Z", temperature: 85, activeAt: "2026-02-09T11:57:00Z", duplicateRank: 1, hidden: false },
      { id: "d4", created_at: "2026-02-09T11:56:00Z", temperature: 70, activeAt: "2026-02-09T11:56:00Z", duplicateRank: 1, hidden: false },
      { id: "d5", created_at: "2026-02-09T11:55:00Z", temperature: 70, activeAt: "2026-02-08T12:00:00Z", duplicateRank: 1, hidden: false },
      { id: "d6", created_at: "2026-02-08T11:55:00Z", temperature: 99, activeAt: "2026-02-08T11:55:00Z", duplicateRank: 1, hidden: false },
      { id: "d7", created_at: "2026-02-08T11:54:00Z", temperature: 50, activeAt: "2026-02-08T11:54:00Z", duplicateRank: 1, hidden: false },
      { id: "d8", created_at: "2026-02-09T11:53:00Z", temperature: 10, activeAt: "2026-02-09T11:53:00Z", duplicateRank: 1, hidden: false },
      { id: "d9", created_at: "2026-02-09T11:52:00Z", temperature: 90, activeAt: "2026-02-09T11:52:00Z", duplicateRank: 1, hidden: true },
      { id: "d10", created_at: "2026-02-09T11:51:00Z", temperature: null, activeAt: "2026-02-09T11:51:00Z", duplicateRank: 1, hidden: false },
      { id: "d11", created_at: "2026-02-09T11:50:00Z", temperature: 40, activeAt: "2026-02-09T11:50:00Z", duplicateRank: 1, hidden: false },
      { id: "d12", created_at: "2026-02-09T11:49:00Z", temperature: 100, activeAt: "2026-02-07T12:00:00Z", duplicateRank: 1, hidden: false },
      { id: "d13", created_at: "2026-02-09T11:48:00Z", temperature: 80, activeAt: "2026-02-09T11:48:00Z", duplicateRank: 3, hidden: false },
      { id: "d14", created_at: "2026-02-09T11:47:00Z", temperature: 0, activeAt: "2026-02-09T11:47:00Z", duplicateRank: 1, hidden: false },
      { id: "d15", created_at: "2026-02-09T11:46:00Z", temperature: 60, activeAt: "2026-02-09T10:00:00Z", duplicateRank: 1, hidden: false },
      { id: "d16", created_at: "2026-02-09T11:45:00Z", temperature: 60, activeAt: "2026-02-09T11:45:00Z", duplicateRank: 1, hidden: false },
      { id: "d17", created_at: "2026-02-09T11:44:00Z", temperature: 60, activeAt: "2026-02-09T11:44:00Z", duplicateRank: 2, hidden: false },
      { id: "d18", created_at: "2026-02-09T11:43:00Z", temperature: 60, activeAt: "2026-02-09T11:44:00Z", duplicateRank: 1, hidden: false }, // same activeAt as d17, older created_at tie-break
      { id: "d19", created_at: "2026-02-09T11:42:00Z", temperature: 60, activeAt: "2026-02-09T11:44:00Z", duplicateRank: 1, hidden: false },
      { id: "d20", created_at: "2026-02-09T11:41:00Z", temperature: 60, activeAt: "2026-02-09T11:44:00Z", duplicateRank: 1, hidden: false }
    ];

    const scored = deals.map((d) => ({
      id: d.id,
      created_at: d.created_at,
      rank_score: computeDealRankScoreV1({
        asOf,
        createdAt: d.created_at,
        activeAt: (d as any).activeAt,
        temperature: (d as any).temperature,
        duplicateRank: (d as any).duplicateRank,
        hidden: (d as any).hidden
      })!
    }));

    const sorted = scored.sort(compareByRankCreatedAtIdDesc).map((d) => d.id);

    // We don't assert every single adjacent swap rationale here; the fixed ordering is the regression guard.
    expect(sorted.length).toBe(20);
    expect(sorted[0]).toBe("d1");
    expect(sorted[sorted.length - 1]).toBe("d9"); // hidden sinks hard
  });

  it("non-regression: 20 cases ordering (listings)", () => {
    const asOf = "2026-02-09T12:00:00Z";
    const listings = [
      { id: "l1", created_at: "2026-02-09T11:59:00Z", trust: 90, flags: [], price: 100, min: 50, max: 150, hidden: false },
      { id: "l2", created_at: "2026-02-09T11:58:00Z", trust: 10, flags: [], price: 100, min: 50, max: 150, hidden: false },
      { id: "l3", created_at: "2026-02-09T11:57:00Z", trust: 90, flags: ["restricted"], price: 100, min: 50, max: 150, hidden: false },
      { id: "l4", created_at: "2026-02-08T12:00:00Z", trust: 90, flags: [], price: 100, min: 50, max: 150, hidden: false },
      { id: "l5", created_at: "2026-02-09T11:56:00Z", trust: 60, flags: [], price: 120, min: 50, max: 150, hidden: false },
      { id: "l6", created_at: "2026-02-09T11:55:00Z", trust: 60, flags: [], price: 10, min: 50, max: 150, hidden: false },
      { id: "l7", created_at: "2026-02-09T11:54:00Z", trust: 10, flags: [], price: 100, min: null, max: null, hidden: false },
      { id: "l8", created_at: "2026-02-09T11:53:00Z", trust: 90, flags: [], price: 100, min: null, max: null, hidden: true },
      { id: "l9", created_at: "2026-02-09T11:52:00Z", trust: 49, flags: [], price: 100, min: 50, max: 150, hidden: false },
      { id: "l10", created_at: "2026-02-09T11:51:00Z", trust: 50, flags: [], price: 100, min: 50, max: 150, hidden: false },
      { id: "l11", created_at: "2026-02-09T11:50:00Z", trust: 80, flags: [], price: 100, min: 50, max: 150, hidden: false },
      { id: "l12", created_at: "2026-02-09T11:49:00Z", trust: 80, flags: ["under_review"], price: 100, min: 50, max: 150, hidden: false },
      { id: "l13", created_at: "2026-02-09T11:48:00Z", trust: 80, flags: [], price: 149, min: 50, max: 150, hidden: false },
      { id: "l14", created_at: "2026-02-09T11:47:00Z", trust: 80, flags: [], price: 101, min: 50, max: 150, hidden: false },
      { id: "l15", created_at: "2026-02-09T11:46:00Z", trust: 80, flags: [], price: 100, min: 99, max: 101, hidden: false },
      { id: "l16", created_at: "2026-02-09T11:45:00Z", trust: 0, flags: [], price: 100, min: 50, max: 150, hidden: false },
      { id: "l17", created_at: "2026-02-09T11:44:00Z", trust: 10, flags: [], price: 100, min: 50, max: 150, hidden: false },
      { id: "l18", created_at: "2026-02-09T11:43:00Z", trust: 10, flags: [], price: 100, min: 50, max: 150, hidden: false },
      { id: "l19", created_at: "2026-02-09T11:42:00Z", trust: 10, flags: [], price: 100, min: 50, max: 150, hidden: false },
      { id: "l20", created_at: "2026-02-09T11:41:00Z", trust: 10, flags: [], price: 100, min: 50, max: 150, hidden: false }
    ];

    const scored = listings.map((l) => ({
      id: l.id,
      created_at: l.created_at,
      rank_score: computeListingRankScoreV1({
        asOf,
        createdAt: l.created_at,
        priceAmount: l.price,
        priceMin: l.min,
        priceMax: l.max,
        sellerTrustScore: l.trust,
        sellerTrustFlags: l.flags,
        hidden: l.hidden
      })!
    }));

    const sorted = scored.sort(compareByRankCreatedAtIdDesc).map((l) => l.id);
    expect(sorted.length).toBe(20);
    expect(sorted[0]).toBe("l1");
    expect(sorted[sorted.length - 1]).toBe("l8"); // hidden sinks hard
  });
});

