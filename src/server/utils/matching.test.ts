import { describe, expect, it } from "vitest";
import {
  tokenize,
  evaluateWatchlistMatch,
  buildEntityTokensFromDeal,
  buildEntityTokensFromListing,
  evaluateWatchlistMatchListing
} from "./matching";

describe("tokenize", () => {
  it("lowercases, splits, and de-dupes tokens", () => {
    expect(tokenize("RTX 4070 - 399€")).toEqual(["rtx", "4070", "399"]);
    expect(tokenize("a b c rtx 4070")).toEqual(["rtx", "4070"]);
  });

  it("can cap tokens when maxTokens is provided", () => {
    expect(tokenize("alpha bravo charlie delta", { maxTokens: 2 })).toEqual(["alpha", "bravo"]);
  });
});

describe("buildEntityTokensFromDeal", () => {
  it("includes title tokens and tags", () => {
    const tokens = buildEntityTokensFromDeal({ title: "RTX 4070", tags: ["gpu", "Nvidia"] });
    expect(tokens).toContain("rtx");
    expect(tokens).toContain("4070");
    expect(tokens).toContain("gpu");
    expect(tokens).toContain("nvidia");
  });

  it("does not cap title tokenization (avoids false negatives for long titles)", () => {
    const title = "alpha bravo charlie delta echo foxtrot golf hotel india";
    const tokens = buildEntityTokensFromDeal({ title, tags: [] });
    expect(tokens).toContain("india"); // 9th unique token
  });
});

describe("evaluateWatchlistMatch", () => {
  it("matches query tokens (AND)", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", price: 399 };
    const watchlist = { active: true, query_text: "rtx 4070", tags: [] };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(true);
  });

  it("matches query tokens even if they appear after the first 8 unique title parts", () => {
    const deal = { title: "alpha bravo charlie delta echo foxtrot golf hotel india", tags: [], currency: "EUR", price: 1 };
    const watchlist = { active: true, query_text: "india", tags: [] };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(true);
  });

  it("requires tags overlap when watchlist.tags is non-empty", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", price: 399 };
    const watchlist = { active: true, query_text: null, tags: ["cpu"] };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(false);
  });

  it("enforces EUR currency when price_max is set", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "USD", price: 399 };
    const watchlist = { active: true, query_text: "rtx", tags: ["gpu"], price_max: 450 };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.currency_mismatch).toBe(true);
  });

  it("treats geo watchlists as non-match (v0 deals have no geo)", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", price: 399 };
    const watchlist = { active: true, query_text: "rtx", tags: ["gpu"], geo_lat: 1, geo_lon: 2, distance_km: 10 };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.geo_missing).toBe(true);
  });
});

describe("buildEntityTokensFromListing", () => {
  it("includes title tokens and category", () => {
    const tokens = buildEntityTokensFromListing({ title: "RTX 4070", category: "gpu" });
    expect(tokens).toContain("rtx");
    expect(tokens).toContain("4070");
    expect(tokens).toContain("gpu");
  });
});

describe("evaluateWatchlistMatchListing", () => {
  it("matches query tokens (AND)", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "EUR", price_amount: 399 };
    const watchlist = { active: true, query_text: "rtx 4070", tags: [] };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(true);
  });

  it("requires category inclusion when watchlist.tags is non-empty", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "EUR", price_amount: 399 };
    const watchlist = { active: true, query_text: null, tags: ["cpu"] };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.tags_ok).toBe(false);
  });

  it("enforces EUR currency when price_max is set", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "USD", price_amount: 399 };
    const watchlist = { active: true, query_text: "rtx", tags: ["gpu"], price_max: 450 };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.currency_mismatch).toBe(true);
  });

  it("enforces geo distance when geo criteria is present", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "EUR", price_amount: 399, geo_lat: 48.86, geo_lng: 2.35 };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], geo_lat: 48.86, geo_lon: 2.35, distance_km: 1 };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(true);
    expect(result.reason.geo_ok).toBe(true);
  });

  it("treats geo watchlists as non-match when listing has no geo", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "EUR", price_amount: 399, geo_lat: null, geo_lng: null };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], geo_lat: 48.86, geo_lon: 2.35, distance_km: 1 };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.geo_missing).toBe(true);
  });
});
