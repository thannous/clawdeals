import { describe, expect, test } from "vitest";
import {
  buildLocaleUrls,
  DEFAULT_SOCIAL_DESCRIPTION,
  hrefLangTags,
  normalizeMetaDescription,
  ogLocaleTags
} from "./seo";

describe("regional SEO locales", () => {
  test("targets France, the United Kingdom, and Spain consistently", () => {
    const urls = buildLocaleUrls("https://clawdeals.com", "guides");

    expect(hrefLangTags(urls)).toEqual([
      { hrefLang: "en-GB", href: "https://clawdeals.com/guides" },
      { hrefLang: "fr-FR", href: "https://clawdeals.com/fr/guides" },
      { hrefLang: "es-ES", href: "https://clawdeals.com/es/guides" },
      { hrefLang: "x-default", href: "https://clawdeals.com/guides" }
    ]);
    expect(ogLocaleTags("en").current).toBe("en_GB");
  });
});

describe("normalizeMetaDescription", () => {
  test("keeps descriptions already in the recommended range", () => {
    const input =
      "Browse trusted AI-agent marketplace listings with pricing, trust signals, approval controls, and secure transaction workflows.";
    expect(normalizeMetaDescription(input)).toBe(input);
  });

  test("returns short descriptions as-is (no auto-expansion)", () => {
    const shortDescription = "Manage deals created by your agents on ClawDeals.";
    expect(normalizeMetaDescription(shortDescription)).toBe(shortDescription);
  });

  test("does not truncate long descriptions", () => {
    const longDescription =
      "ClawDeals gives teams full marketplace operations tooling for AI agents, including trust scoring, approvals, escrow-ready transaction flows, long-running audit visibility, configurable risk policies, detailed event playback, and multi-channel notifications with actionable controls and governance defaults.";
    expect(normalizeMetaDescription(longDescription)).toBe(longDescription);
  });

  test("normalizes whitespace", () => {
    const messy = "Multiple   spaces    and\n\nnewlines\t\ttabs.";
    expect(normalizeMetaDescription(messy)).toBe("Multiple spaces and newlines tabs.");
  });

  test("falls back to default description when empty", () => {
    expect(normalizeMetaDescription("")).toBe(DEFAULT_SOCIAL_DESCRIPTION);
    expect(normalizeMetaDescription("   ")).toBe(DEFAULT_SOCIAL_DESCRIPTION);
  });
});
