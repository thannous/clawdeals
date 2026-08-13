import { describe, expect, it } from "vitest";

import {
  isAppEntryUrl,
  isMarketingSurface,
  localeToMarketCode,
  normalizeAcquisitionId,
  normalizeLandingPath,
  resolveAcquisitionAttribution,
  resolveAcquisitionChannel,
  sanitizeAttributionValue
} from "./acquisition";

describe("acquisition attribution", () => {
  it("classifies search referrers without storing the search query", () => {
    const result = resolveAcquisitionAttribution(
      "https://clawdeals.com/es/mcp",
      "https://www.google.es/search?q=private+keywords"
    );

    expect(result).toEqual({
      source: "google.es",
      medium: "organic",
      channel: "organic_search",
      campaign: null,
      referrerHost: "google.es",
      isOrganic: true
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("maps normalized source and medium values to stable reporting channels", () => {
    expect(resolveAcquisitionChannel({ source: "google", medium: "cpc" })).toBe("paid_search");
    expect(resolveAcquisitionChannel({ source: "newsletter", medium: "email" })).toBe("email");
    expect(resolveAcquisitionChannel({ source: "partner", medium: "referral" })).toBe("referral");
    expect(resolveAcquisitionChannel({ source: "direct", medium: "none" })).toBe("direct");
    expect(resolveAcquisitionChannel({ source: "launch", medium: "campaign" })).toBe("other");
  });

  it("allows only bounded attribution labels and strips query strings from paths", () => {
    expect(sanitizeAttributionValue("SEO_launch-1")).toBe("seo_launch-1");
    expect(sanitizeAttributionValue("contains spaces")).toBeNull();
    expect(normalizeLandingPath("/fr/mcp?email=person@example.com#step")).toBe("/fr/mcp");
  });

  it("accepts UUID acquisition IDs and explicit European market mappings", () => {
    expect(normalizeAcquisitionId("018f3c2a-1e4b-4f8a-9ac0-0123456789ab")).toBe(
      "018f3c2a-1e4b-4f8a-9ac0-0123456789ab"
    );
    expect(normalizeAcquisitionId("not-a-uuid")).toBeNull();
    expect(localeToMarketCode("fr")).toBe("FR");
    expect(localeToMarketCode("es")).toBe("ES");
    expect(localeToMarketCode("en")).toBe("GB");
  });

  it("tracks only public marketing surfaces and recognizes localized start URLs", () => {
    expect(isMarketingSurface("clawdeals.com", "/es/mcp")).toBe(true);
    expect(isMarketingSurface("app.clawdeals.com", "/es/mcp")).toBe(false);
    expect(isMarketingSurface("clawdeals.com", "/fr/start")).toBe(false);
    expect(isAppEntryUrl(new URL("https://app.clawdeals.com/es/start"))).toBe(true);
    expect(isAppEntryUrl(new URL("https://app.clawdeals.com/es/deals"))).toBe(false);
  });
});
