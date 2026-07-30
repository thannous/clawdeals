import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../shared/i18n";
import { GUIDE_SLUGS, SEO_GUIDES, SEO_GUIDE_REGISTRY } from "./seo-guides";

describe("SEO guide registry", () => {
  it("contains unique, localized records for existing and new guides", () => {
    expect(SEO_GUIDE_REGISTRY).toHaveLength(6);
    expect(new Set(SEO_GUIDE_REGISTRY.map((guide) => guide.slug)).size).toBe(SEO_GUIDE_REGISTRY.length);

    for (const guide of SEO_GUIDE_REGISTRY) {
      expect(guide.locales).toEqual(SUPPORTED_LOCALES);
      expect(guide.author).toBe("ClawDeals Editorial Team");
      expect(guide.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(guide.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(guide.updatedAt >= guide.publishedAt).toBe(true);
      for (const locale of SUPPORTED_LOCALES) {
        expect(guide.title[locale].trim().length).toBeGreaterThan(20);
        expect(guide.metaDescription[locale].trim().length).toBeGreaterThan(80);
      }
    }
  });

  it("provides substantive visible content for every new guide and locale", () => {
    expect(SEO_GUIDES.map((guide) => guide.slug)).toEqual(GUIDE_SLUGS);

    for (const guide of SEO_GUIDES) {
      expect(["Article", "HowTo"]).toContain(guide.schemaType);
      expect(guide.relatedGuides.length).toBeGreaterThanOrEqual(3);
      for (const locale of SUPPORTED_LOCALES) {
        const content = guide.content[locale];
        expect(content.sections.length).toBeGreaterThanOrEqual(5);
        expect(content.metaTitle).toContain("ClawDeals");
        expect(content.metaDescription.length).toBeLessThanOrEqual(160);
        expect(content.formatLabel).not.toMatch(/\d+\s*min/i);
        for (const section of content.sections) {
          expect(section.id).toBeTruthy();
          expect(section.title).toBeTruthy();
          expect(section.paragraphs.join(" ").length).toBeGreaterThan(70);
        }
      }
    }
  });

  it("keeps the original publication dates for existing guides", () => {
    const dealWatch = SEO_GUIDE_REGISTRY.find((guide) => guide.slug === "openclaw-dealwatch");
    const mcpSafety = SEO_GUIDE_REGISTRY.find((guide) => guide.slug === "mcp-marketplace-safety");

    expect(dealWatch).toMatchObject({ publishedAt: "2026-02-13", updatedAt: "2026-07-29" });
    expect(mcpSafety).toMatchObject({ publishedAt: "2026-02-13", updatedAt: "2026-07-29" });
  });
});
