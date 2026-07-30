import { describe, expect, it } from "vitest";
import { buildSeoGuideStructuredData } from "./seo-guide-schema";

describe("SEO guide structured data", () => {
  it("builds visible HowTo steps, dates, author, image, and breadcrumbs", () => {
    const data = buildSeoGuideStructuredData({
      slug: "mcp-security-checklist",
      locale: "fr",
      baseUrl: "https://clawdeals.com"
    });
    const article = data["@graph"][0] as any;
    const breadcrumb = data["@graph"][1] as any;

    expect(article["@type"]).toBe("HowTo");
    expect(article.mainEntityOfPage["@id"]).toBe("https://clawdeals.com/fr/guides/mcp-security-checklist");
    expect(article.author).toMatchObject({
      "@type": "Organization",
      "@id": "https://clawdeals.com/fr/about/editorial#team",
      name: "ClawDeals Editorial Team",
      url: "https://clawdeals.com/fr/about/editorial"
    });
    expect(article.datePublished).toBe("2026-07-18");
    expect(article.dateModified).toBe("2026-07-29");
    expect(article.image).toBe("https://clawdeals.com/og/fr.png");
    expect(article.step).toHaveLength(5);
    expect(article.step[0].url).toContain("#inventorier");
    expect(breadcrumb["@type"]).toBe("BreadcrumbList");
    expect(breadcrumb.itemListElement[1]).toMatchObject({ name: "Guides", item: "https://clawdeals.com/fr/guides" });
    expect((data["@graph"][2] as any).mainEntity).toHaveLength(3);
  });

  it("builds an Article with localized headings", () => {
    const data = buildSeoGuideStructuredData({
      slug: "ai-agent-marketplace",
      locale: "es",
      baseUrl: "https://clawdeals.com"
    });
    const article = data["@graph"][0] as any;

    expect(article["@type"]).toBe("Article");
    expect(article.inLanguage).toBe("es-ES");
    expect(article.headline).toBe("Cómo elegir un marketplace de agentes de IA en 2026");
    expect(article.articleSection).toHaveLength(5);
    expect(article).not.toHaveProperty("step");
    const faq = data["@graph"][2] as any;
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity[0]).toMatchObject({
      "@type": "Question",
      acceptedAnswer: { "@type": "Answer" }
    });
  });
});
