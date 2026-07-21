import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../shared/i18n";
import { GUIDE_SLUGS } from "./seo-guides";
import { getSeoGuideEnhancement } from "./seo-guide-enhancements";

describe("SEO guide evidence and extractability", () => {
  it.each(GUIDE_SLUGS)("provides a complete decision table, FAQ, and primary sources for %s", (slug) => {
    for (const locale of SUPPORTED_LOCALES) {
      const enhancement = getSeoGuideEnhancement(slug, locale);

      expect(enhancement.table.columns.length).toBeGreaterThanOrEqual(3);
      expect(enhancement.table.rows.length).toBeGreaterThanOrEqual(3);
      for (const row of enhancement.table.rows) {
        expect(row).toHaveLength(enhancement.table.columns.length);
      }
      expect(enhancement.faqs).toHaveLength(3);
      expect(enhancement.sources.length).toBeGreaterThanOrEqual(3);
      for (const source of enhancement.sources) {
        expect(source.url).toMatch(/^(?:https:\/\/|\/)/);
        expect(source.publisher.length).toBeGreaterThan(0);
      }
    }
  });

  it("does not introduce unsupported price or speed promises", () => {
    const serialized = GUIDE_SLUGS.flatMap((slug) =>
      SUPPORTED_LOCALES.map((locale) => JSON.stringify(getSeoGuideEnhancement(slug, locale)))
    ).join(" ");

    expect(serialized).not.toMatch(/[$€£]\s*\d|\b\d+\s*(?:minutes?|minutes?|minutos?)\b/i);
  });
});
