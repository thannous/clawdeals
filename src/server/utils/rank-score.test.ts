import { describe, expect, it } from "vitest";
import {
  HIDDEN_RANK_SCORE,
  computeDealRankScore,
  computeDealTrendScore,
  computeDuplicatePenaltyFactor,
  compareDealsByRank,
  sortDealsByRank,
  compareListingsByRank,
  computeListingRankScore,
  computeListingRecencyScore,
  computeSellerTrustMultiplier,
  sortListingsByRank
} from "./rank-score";

describe("rank-score (TI-270)", () => {
  describe("deals", () => {
    it("trend score equals temperature when age is 0h", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const activeAt = "2026-02-09T12:00:00.000Z";
      expect(computeDealTrendScore({ temperature: 80, activeAt, asOf })).toBe(80);
    });

    it("trend score decays with age (12h => half)", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const activeAt = "2026-02-09T00:00:00.000Z";
      expect(computeDealTrendScore({ temperature: 80, activeAt, asOf })).toBe(40);
    });

    it("trend score decays with age (36h => quarter)", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const activeAt = "2026-02-08T00:00:00.000Z";
      expect(computeDealTrendScore({ temperature: 80, activeAt, asOf })).toBe(20);
    });

    it("treats future active_at as age 0 (guards clock skew)", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const activeAt = "2026-02-10T12:00:00.000Z";
      expect(computeDealTrendScore({ temperature: 77, activeAt, asOf })).toBe(77);
    });

    it("returns 0 trend score when active_at is missing/invalid", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      expect(computeDealTrendScore({ temperature: 77, activeAt: null, asOf })).toBe(0);
      expect(computeDealTrendScore({ temperature: 77, activeAt: "nope", asOf })).toBe(0);
    });

    it("excludes hidden deals from ranking (score=-Infinity)", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const activeAt = "2026-02-09T12:00:00.000Z";
      expect(computeDealRankScore({ temperature: 80, activeAt, asOf, hidden: true })).toBe(HIDDEN_RANK_SCORE);
    });

    it("applies duplicate penalty (non-canonical duplicates in group)", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const activeAt = "2026-02-09T12:00:00.000Z";
      // base=80, groupSize=4 => penalty=0.5
      expect(
        computeDealRankScore({ temperature: 80, activeAt, asOf, duplicateGroupSize: 4, duplicateIsCanonical: false })
      ).toBe(40);
    });

    it("does not penalize canonical item in a duplicate group", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const activeAt = "2026-02-09T12:00:00.000Z";
      expect(computeDealRankScore({ temperature: 80, activeAt, asOf, duplicateGroupSize: 4, duplicateIsCanonical: true })).toBe(
        80
      );
    });

    it("tie-breaker: for equal rank_score, created_at then deal_id desc (active_at not used)", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      // All compute to rank_score=40, but active_at differs:
      // a: temp=40 age=0h -> 40
      // b: temp=60 age=6h -> 40
      // c: temp=80 age=12h -> 40
      // Sort must ignore active_at and use deal_id desc when created_at ties.
      const a: any = { deal_id: "a", temperature: 40, active_at: "2026-02-09T12:00:00.000Z", created_at: "2026-02-09T00:00:00.000Z" };
      const b: any = { deal_id: "b", temperature: 60, active_at: "2026-02-09T06:00:00.000Z", created_at: "2026-02-09T00:00:00.000Z" };
      const c: any = { deal_id: "c", temperature: 80, active_at: "2026-02-09T00:00:00.000Z", created_at: "2026-02-09T00:00:00.000Z" };
      expect(sortDealsByRank([a, b, c], { asOf }).map((d) => d.deal_id)).toEqual(["c", "b", "a"]);
    });

    it("tie-breaker: for equal score+active_at, more recent created_at ranks first", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const left: any = {
        deal_id: "a",
        temperature: 80,
        active_at: "2026-02-09T12:00:00.000Z",
        created_at: "2026-02-09T11:00:00.000Z"
      };
      const right: any = {
        deal_id: "b",
        temperature: 80,
        active_at: "2026-02-09T12:00:00.000Z",
        created_at: "2026-02-09T11:30:00.000Z"
      };
      expect(sortDealsByRank([left, right], { asOf }).map((d) => d.deal_id)).toEqual(["b", "a"]);
    });

    it("tie-breaker: for fully equal timestamps, deal_id desc ranks first", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const a: any = {
        deal_id: "a",
        temperature: 80,
        active_at: "2026-02-09T12:00:00.000Z",
        created_at: "2026-02-09T11:00:00.000Z"
      };
      const b: any = {
        deal_id: "b",
        temperature: 80,
        active_at: "2026-02-09T12:00:00.000Z",
        created_at: "2026-02-09T11:00:00.000Z"
      };
      expect(sortDealsByRank([a, b], { asOf }).map((d) => d.deal_id)).toEqual(["b", "a"]);
    });
  });

  describe("listings", () => {
    it("recency score is 1 at age 0h", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      expect(computeListingRecencyScore({ asOf, createdAt: asOf })).toBe(1);
    });

    it("recency score decays with age (24h => 0.5)", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const createdAt = "2026-02-08T12:00:00.000Z";
      expect(computeListingRecencyScore({ asOf, createdAt })).toBe(0.5);
    });

    it("trust multiplier uses bands and quarantine penalty", () => {
      expect(computeSellerTrustMultiplier({ sellerTrustScore: 80, sellerTrustFlags: [] })).toBeGreaterThan(
        computeSellerTrustMultiplier({ sellerTrustScore: 50, sellerTrustFlags: [] })
      );
      expect(computeSellerTrustMultiplier({ sellerTrustScore: 50, sellerTrustFlags: [] })).toBeGreaterThan(
        computeSellerTrustMultiplier({ sellerTrustScore: 20, sellerTrustFlags: [] })
      );

      const mid = computeSellerTrustMultiplier({ sellerTrustScore: 50, sellerTrustFlags: [] });
      const quarantined = computeSellerTrustMultiplier({ sellerTrustScore: 50, sellerTrustFlags: ["quarantined"] });
      expect(quarantined).toBeLessThan(mid);
    });

    it("excludes hidden listings from ranking (score=-Infinity)", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const createdAt = "2026-02-09T12:00:00.000Z";
      expect(computeListingRankScore({ asOf, createdAt, hidden: true })).toBe(HIDDEN_RANK_SCORE);
    });

    it("duplicate penalty uses 1/sqrt(groupSize) for non-canonical items", () => {
      expect(computeDuplicatePenaltyFactor({ groupSize: 4, isCanonical: false })).toBe(0.5);
      expect(computeDuplicatePenaltyFactor({ groupSize: 2, isCanonical: false })).toBe(0.707107);
      expect(computeDuplicatePenaltyFactor({ groupSize: 4, isCanonical: true })).toBe(1);
    });

    it("listing rank_score prefers more recent listings (all else equal)", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const newer: any = {
        listing_id: "b",
        created_at: "2026-02-09T11:00:00.000Z",
        price_amount: 100,
        seller_trust_score: 50
      };
      const older: any = {
        listing_id: "a",
        created_at: "2026-02-08T11:00:00.000Z",
        price_amount: 100,
        seller_trust_score: 50
      };
      expect(sortListingsByRank([older, newer], { asOf }).map((l) => l.listing_id)).toEqual(["b", "a"]);
    });

    it("listing rank_score prefers higher trust band (all else equal)", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const createdAt = "2026-02-09T11:00:00.000Z";
      const high: any = { listing_id: "high", created_at: createdAt, price_amount: 100, seller_trust_score: 80 };
      const low: any = { listing_id: "low", created_at: createdAt, price_amount: 100, seller_trust_score: 20 };
      expect(compareListingsByRank(high, low, { asOf })).toBeLessThan(0); // high first
      expect(sortListingsByRank([low, high], { asOf }).map((l) => l.listing_id)).toEqual(["high", "low"]);
    });

    it("price fit bonus prefers cheaper items under the same max", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const createdAt = "2026-02-09T11:00:00.000Z";
      const cheap: any = { listing_id: "cheap", created_at: createdAt, price_amount: 50, seller_trust_score: 50 };
      const expensive: any = { listing_id: "expensive", created_at: createdAt, price_amount: 100, seller_trust_score: 50 };
      expect(sortListingsByRank([expensive, cheap], { asOf, priceTargetMax: 100 }).map((l) => l.listing_id)).toEqual([
        "cheap",
        "expensive"
      ]);
    });

    it("tie-breaker: for equal score, created_at desc then listing_id desc", () => {
      const asOf = "2026-02-09T12:00:00.000Z";
      const left: any = { listing_id: "a", created_at: "2026-02-09T11:00:00.000Z", seller_trust_score: 50 };
      const right: any = { listing_id: "b", created_at: "2026-02-09T11:00:00.000Z", seller_trust_score: 50 };
      expect(sortListingsByRank([left, right], { asOf }).map((l) => l.listing_id)).toEqual(["b", "a"]);

      const newer: any = { listing_id: "a", created_at: "2026-02-09T11:30:00.000Z", seller_trust_score: 50 };
      const older: any = { listing_id: "z", created_at: "2026-02-09T11:00:00.000Z", seller_trust_score: 50 };
      expect(sortListingsByRank([older, newer], { asOf }).map((l) => l.listing_id)).toEqual(["a", "z"]);
    });
  });
});
