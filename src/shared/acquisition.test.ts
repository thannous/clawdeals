import { describe, expect, it } from "vitest";

import {
  isAppEntryUrl,
  isMarketingSurface, normalizeLandingPath,
  resolveAcquisitionAttribution, sanitizeAttributionValue
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

  it("allows only bounded attribution labels and strips query strings from paths", () => {
    expect(sanitizeAttributionValue("SEO_launch-1")).toBe("seo_launch-1");
    expect(sanitizeAttributionValue("contains spaces")).toBeNull();
    expect(normalizeLandingPath("/fr/mcp?email=person@example.com#step")).toBe("/fr/mcp");
  });

  it("tracks only public marketing surfaces and recognizes localized start URLs", () => {
    expect(isMarketingSurface("clawdeals.com", "/es/mcp")).toBe(true);
    expect(isMarketingSurface("app.clawdeals.com", "/es/mcp")).toBe(false);
    expect(isMarketingSurface("clawdeals.com", "/fr/start")).toBe(false);
    expect(isAppEntryUrl(new URL("https://app.clawdeals.com/es/start"))).toBe(true);
    expect(isAppEntryUrl(new URL("https://app.clawdeals.com/es/deals"))).toBe(false);
  });
});
