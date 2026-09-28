import { describe, expect, it } from "vitest";
import {
  evaluateWatchlistMatch as evaluateWatchlistMatchRaw,
  evaluateWatchlistMatchListing as evaluateWatchlistMatchListingRaw
} from "./matching";

function evaluateWatchlistMatch({ deal, watchlist, ...rest }: any) {
  return evaluateWatchlistMatchRaw({
    deal: { market_code: "FR", ...deal },
    watchlist: { market_code: "FR", currency: "EUR", ...watchlist },
    ...rest
  });
}

function evaluateWatchlistMatchListing({ listing, watchlist, ...rest }: any) {
  return evaluateWatchlistMatchListingRaw({
    listing: { market_code: "FR", ...listing },
    watchlist: { market_code: "FR", currency: "EUR", ...watchlist },
    ...rest
  });
}

describe("evaluateWatchlistMatch", () => {

  it("matches query tokens even if they appear after the first 8 unique title parts", () => {
    const deal = { title: "alpha bravo charlie delta echo foxtrot golf hotel india", tags: [], currency: "EUR", price: 1 };
    const watchlist = { active: true, query_text: "india", tags: [] };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(true);
  });

  it("does not match watchlists from another market", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", market_code: "ES", price: 399 };
    const watchlist = { active: true, query_text: "rtx", tags: ["gpu"], currency: "EUR", market_code: "FR" };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.market_ok).toBe(false);
  });

  it("treats geo watchlists as non-match (v0 deals have no geo)", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", price: 399 };
    const watchlist = { active: true, query_text: "rtx", tags: ["gpu"], geo_lat: 1, geo_lon: 2, distance_km: 10 };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.geo_missing).toBe(true);
  });

  it("filters by deal_type when criteria.deal_type is set", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", price: 399, deal_type: "ONLINE" };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { deal_type: "LOCAL" } };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.deal_type_ok).toBe(false);
  });

  it("matches when deal_type matches criteria", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", price: 399, deal_type: "LOCAL" };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { deal_type: "LOCAL" } };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(true);
    expect(result.reason.deal_type_ok).toBe(true);
  });

  it("defaults to ONLINE when deal has no deal_type", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", price: 399 };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { deal_type: "ONLINE" } };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(true);
  });

  it("filters by country when criteria.country is set", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", price: 399, country: "DE" };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { country: "FR" } };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.country_ok).toBe(false);
  });

  it("matches when country matches criteria", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", price: 399, country: "FR" };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { country: "FR" } };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(true);
    expect(result.reason.country_ok).toBe(true);
  });

  it("rejects when deal has no country but criteria requires one", () => {
    const deal = { title: "RTX 4070 deal", tags: ["gpu"], currency: "EUR", price: 399 };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { country: "FR" } };
    const result = evaluateWatchlistMatch({ deal, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.country_ok).toBe(false);
  });
});

describe("evaluateWatchlistMatchListing", () => {

  it("treats geo watchlists as non-match when listing has no geo", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "EUR", price_amount: 399, geo_lat: null, geo_lng: null };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], geo_lat: 48.86, geo_lon: 2.35, distance_km: 1 };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.geo_missing).toBe(true);
  });

  it("filters by delivery_method when criteria is set", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "EUR", price_amount: 399, delivery_method: "PICKUP" };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { delivery_method: "SHIPPING" } };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.delivery_method_ok).toBe(false);
  });

  it("matches when delivery_method matches exactly", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "EUR", price_amount: 399, delivery_method: "SHIPPING" };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { delivery_method: "SHIPPING" } };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(true);
    expect(result.reason.delivery_method_ok).toBe(true);
  });

  it("listing BOTH matches any criteria delivery_method", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "EUR", price_amount: 399, delivery_method: "BOTH" };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { delivery_method: "PICKUP" } };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(true);
    expect(result.reason.delivery_method_ok).toBe(true);
  });

  it("criteria BOTH matches any listing delivery_method", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "EUR", price_amount: 399, delivery_method: "SHIPPING" };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { delivery_method: "BOTH" } };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(true);
    expect(result.reason.delivery_method_ok).toBe(true);
  });

  it("rejects when listing has no delivery_method but criteria requires one", () => {
    const listing = { title: "RTX 4070", category: "gpu", currency: "EUR", price_amount: 399 };
    const watchlist = { active: true, query_text: null, tags: ["gpu"], criteria: { delivery_method: "PICKUP" } };
    const result = evaluateWatchlistMatchListing({ listing, watchlist });
    expect(result.matched).toBe(false);
    expect(result.reason.delivery_method_ok).toBe(false);
  });
});
