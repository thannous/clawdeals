import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../shared/i18n";
import { getLegacyGuideEnhancement, type LegacyGuideSlug } from "./legacy-guide-enhancements";

const SLUGS: readonly LegacyGuideSlug[] = ["openclaw-dealwatch", "mcp-marketplace-safety"];

describe("legacy guide evidence and extractability", () => {
  it.each(SLUGS)("provides localized tables, FAQs, and primary sources for %s", (slug) => {
    for (const locale of SUPPORTED_LOCALES) {
      const enhancement = getLegacyGuideEnhancement(slug, locale);
      expect(enhancement.table.rows.length).toBeGreaterThanOrEqual(4);
      expect(enhancement.faqs).toHaveLength(3);
      expect(enhancement.sources.some((source) => source.url.startsWith("https://"))).toBe(true);
      for (const row of enhancement.table.rows) {
        expect(row).toHaveLength(enhancement.table.columns.length);
      }
    }
  });
});
