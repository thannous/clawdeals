import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { SEO_SITEMAP_ROUTES } from "../../src/content/seo-routes";

// Exercise the HTTP response, not only hydrated DOM: next/script can make a
// browser-only check pass while crawlers receive no JSON-LD at all.
for (const locale of ["en", "fr", "es"] as const) {
  test(`public structured data is complete in ${locale} server HTML`, { timeout: 180_000 }, async ({ app, browser }) => {
    await app.open(locale === "en" ? "/" : `/${locale}`);
    for (const { path } of SEO_SITEMAP_ROUTES) {
      const localizedPath = `${locale === "en" ? "" : `/${locale}`}${path === "/" ? "" : path}` || "/";
      const response = await fetch(new URL(localizedPath, app.baseUrl), { headers: { "Accept-Language": locale } });
      expect(response.status).toBe(200);
      const document = await browser.evaluate((html: string) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const graphs = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map(script => JSON.parse(script.textContent || "null"));
        doc.querySelectorAll("script, style").forEach(node => node.remove());
        return {
          graphs,
          canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
          ids: Array.from(doc.querySelectorAll("[id]")).map(node => node.id),
          dates: Array.from(doc.querySelectorAll("time[datetime]")).map(node => node.getAttribute("datetime")),
          text: doc.body.textContent?.replace(/\s+/g, " ") || ""
        };
      }, await response.text());
      expect(document.graphs).toHaveLength(1);
      const graph = document.graphs[0]["@graph"];
      expect(document.graphs[0]["@context"]).toBe("https://schema.org");
      const types = (node: Record<string, unknown>): string[] => [node["@type"]].flat() as string[];
      const ids = graph.map((node: Record<string, unknown>) => node["@id"]).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
      const canonical = String(document.canonical);
      expect(new URL(canonical).pathname).toBe(localizedPath);
      const home = new URL(locale === "en" ? "/" : `/${locale}`, canonical).href;
      const page = graph.find((node: Record<string, unknown>) => types(node).some(type => ["WebPage", "CollectionPage", "AboutPage"].includes(type)));
      expect(page?.url).toBe(canonical);
      expect(page?.inLanguage).toBe({ en: "en-GB", fr: "fr-FR", es: "es-ES" }[locale]);
      expect(graph.some((node: Record<string, unknown>) => types(node).includes("SoftwareApplication"))).toBe(false);
      expect(JSON.stringify(graph)).not.toContain("https://github.com/clawdeals");
      const faq = graph.find((node: Record<string, unknown>) => types(node).includes("FAQPage"));
      if (faq) expect(document.ids).toContain(new URL(faq.url || faq["@id"]).hash.slice(1));
      if (path === "/") {
        const website = graph.find((node: Record<string, unknown>) => types(node).includes("WebSite"));
        expect(website?.name).toBe("ClawDeals");
        expect(website?.inLanguage).toEqual(["en-GB", "fr-FR", "es-ES"]);
        expect(graph.some((node: Record<string, unknown>) => types(node).includes("Organization"))).toBe(true);
      } else {
        const breadcrumbs = graph.find((node: Record<string, unknown>) => types(node).includes("BreadcrumbList"));
        expect(breadcrumbs.itemListElement[0].item).toBe(home);
        expect(breadcrumbs.itemListElement.at(-1).item).toBe(canonical);
        breadcrumbs.itemListElement.forEach((item: { name: string; position: number; item: string }, index: number) => {
          expect(item.position).toBe(index + 1);
          expect(item.name.length).toBeGreaterThan(0);
          expect(new URL(item.item).origin).toBe(new URL(canonical).origin);
        });
      }
      if (path.startsWith("/guides/")) {
        const article = graph.find((node: Record<string, unknown>) => types(node).some(type => ["Article", "TechArticle"].includes(type)));
        expect(article?.headline.length).toBeGreaterThan(0);
        expect(article?.author.name).toBe("ClawDeals Editorial Team");
        expect(article?.["@id"]).not.toBe(article?.mainEntityOfPage["@id"]);
        for (const date of [article.datePublished, article.dateModified]) {
          expect(Number.isFinite(Date.parse(date))).toBe(true);
          expect(document.dates).toContain(date);
        }
        for (const step of article.step || []) {
          expect(document.ids).toContain(new URL(step.url).hash.slice(1));
          expect(document.text).toContain(step.name);
        }
        for (const question of faq.mainEntity) {
          expect(document.text).toContain(question.name);
          expect(document.text).toContain(question.acceptedAnswer.text);
        }
      }
    }
    // Collapsed answers are not in the initial DOM. Prove the emitted answers
    // really become visible to visitors, in each supported language.
    const questions = await browser.evaluate(() => {
      const graph = JSON.parse(document.querySelector("#home-json-ld")?.textContent || "{}")["@graph"];
      return graph.find((node: { "@type": string }) => node["@type"] === "FAQPage").mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
    });
    for (let index = 0; index < questions.length; index++) {
      const button = browser.locator("#faq button").nth(index);
      // The design displays questions with CSS text-transform: uppercase.
      await expect(button).toHaveText(questions[index].name, { ignoreCase: true });
      await button.click();
      await expect(browser.locator("#faq p")).toHaveText(questions[index].acceptedAnswer.text);
    }
  });
}

test("client navigation replaces schema and preserves the selected language", async ({ app, browser, screen }) => {
  await app.open("/");
  await expect(browser.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await screen.getByRole("link", "Trust Engine", { exact: true }).click();
  await expect(browser).toHaveURL("/trust-engine");
  await expect(browser.locator("#home-json-ld")).toHaveCount(0);
  await expect(browser.locator("#trust-engine-json-ld")).toHaveCount(1);
  const nav = screen.getByRole("navigation");
  if (await browser.evaluate(() => window.innerWidth < 640)) {
    await screen.getByTestId("navbar-mobile-settings-toggle").click();
  } else {
    await nav.getByRole("button", "EN").click();
  }
  await nav.getByRole("link", "FR").click();
  await expect(browser).toHaveURL("/fr/trust-engine");
  await expect(browser.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await expect(browser.locator("#trust-engine-json-ld")).toContainText('"inLanguage":"fr-FR"');
  await expect(browser.locator("#trust-engine-json-ld")).not.toContainText('"inLanguage":"en-GB"');
});
