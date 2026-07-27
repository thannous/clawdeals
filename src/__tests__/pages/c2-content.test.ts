import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import frMessages from "../../../messages/fr.json";
import { getSeoGuide } from "../../content/seo-guides";
import { MCP_SEO } from "../../pages/mcp";
import { SEO as OPENCLAW_SEO } from "../../pages/integrations/openclaw";
import type { SupportedLocale } from "../../shared/i18n";
import { ACTIVATION_PATH_COPY } from "../../ui/seo/ActivationPath";

const LOCALES: readonly SupportedLocale[] = ["en", "fr", "es"];
const MESSAGES = { en: enMessages, fr: frMessages, es: esMessages };

describe("C2 SEO and activation content", () => {
  it("replaces unsupported homepage superlatives and continuous-monitoring promises", () => {
    for (const locale of LOCALES) {
      const landing = MESSAGES[locale].landing;
      const auditedCopy = JSON.stringify({
        hero: landing.hero,
        dealsShowcase: landing.showcase.deals
      });

      expect(auditedCopy).not.toMatch(/largest|plus grande|mayor marketplace|24\/7/i);
      expect(auditedCopy).toMatch(/FR\/EUR/);
      expect(auditedCopy).toMatch(/GB\/GBP/);
      expect(auditedCopy).toMatch(/ES\/EUR/);
    }
  });

  it("keeps localized metadata specific and within snippet-oriented limits", () => {
    for (const locale of LOCALES) {
      const homeSeo = MESSAGES[locale].seo.home;
      const records = [homeSeo, MCP_SEO[locale], OPENCLAW_SEO[locale]];

      for (const record of records) {
        expect(record.title.length).toBeGreaterThanOrEqual(40);
        expect(record.title.length).toBeLessThanOrEqual(60);
        expect(record.description.length).toBeGreaterThanOrEqual(110);
        expect(record.description.length).toBeLessThanOrEqual(160);
      }
    }
  });

  it("defines one cautious activation path for every launch locale", () => {
    for (const locale of LOCALES) {
      const copy = ACTIVATION_PATH_COPY[locale];
      const serialized = JSON.stringify(copy);

      expect(copy.steps).toHaveLength(4);
      expect(serialized).toContain("FR/EUR");
      expect(serialized).toContain("GB/GBP");
      expect(serialized).toContain("ES/EUR");
      expect(serialized).toMatch(/merchant|marchand|comerci/i);
      expect(serialized).toMatch(/retention|rétention|retención/i);
    }
  });

  it("adds published entry points and activation evidence to the existing comparison guide", () => {
    const guide = getSeoGuide("openclaw-skill-vs-mcp-vs-clawhub");
    expect(guide.updatedAt).toBe("2026-07-27");

    for (const locale of LOCALES) {
      const serialized = JSON.stringify(guide.content[locale]);
      expect(serialized).toContain("https://clawdeals.com/skill.md");
      expect(serialized).toContain("npx -y clawdeals-mcp install");
      expect(serialized).toContain("clawhub install clawdeals");
      expect(serialized).toContain("FR/EUR");
      expect(serialized).toContain("GB/GBP");
      expect(serialized).toContain("ES/EUR");
      expect(serialized).toMatch(/merchant|marchand|comerci/i);
    }
  });

  it("does not publish an unsupported zero-price offer in homepage or MCP schema", () => {
    const indexSource = fs.readFileSync(path.join(process.cwd(), "src/pages/index.tsx"), "utf8");
    const mcpSource = fs.readFileSync(path.join(process.cwd(), "src/pages/mcp.tsx"), "utf8");

    expect(indexSource).not.toContain('price: "0"');
    expect(indexSource).not.toContain("priceCurrency");
    expect(mcpSource).not.toContain('price: "0"');
    expect(mcpSource).not.toContain("priceCurrency");
  });
});
