import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import frMessages from "../../../messages/fr.json";
import ogHandler from "../../pages/api/og";
import { SKIP_TO_CONTENT } from "../../pages/_document";
import { META as MARKETPLACE_META } from "../../pages/marketplace";
import { META as PRICE_ALERTS_META } from "../../pages/browse/deals";
import { MCP_SEO } from "../../pages/mcp";
import { getSeoGuide } from "../../content/seo-guides";

describe("shared international localization", () => {
  it("localizes the skip link and shared navigation labels", () => {
    expect(SKIP_TO_CONTENT).toEqual({
      en: "Skip to content",
      fr: "Aller au contenu",
      es: "Ir al contenido"
    });
    expect(frMessages.nav.marketAccessGranted).toBe("ACCÈS_MARCHÉ_AUTORISÉ");
    expect(esMessages.nav.marketAccessGranted).toBe("ACCESO_AL_MERCADO_AUTORIZADO");
    expect(frMessages.landing.mcp.guide).toBe("Guide MCP");
    expect(esMessages.landing.mcp.guide).toBe("Guía MCP");
  });

  it("contains no fixed-duration promise in the guided setup messages", () => {
    expect(enMessages.seo.featureLayout.ctaBody).toContain("guided setup");
    expect(frMessages.seo.featureLayout.ctaBody).toContain("configuration guidée");
    expect(esMessages.seo.featureLayout.ctaBody).toContain("configuración guiada");
    expect([enMessages, frMessages, esMessages].map((messages) => messages.mcp.subtitle).join(" ")).not.toMatch(/3\s*min/i);
  });

  it("ships a 1200x630 Spanish PNG and maps the OG endpoint to it", () => {
    const png = readFileSync(`${process.cwd()}/public/og/es.png`);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);

    const setHeader = vi.fn();
    const redirect = vi.fn();
    ogHandler({ query: { locale: "es" } } as never, { setHeader, redirect } as never);

    expect(redirect).toHaveBeenCalledWith(302, "/og/es.png");
  });

  it("keeps localized homepage, legacy marketplace, and OpenClaw guide titles distinct", () => {
    expect(new Set([
      enMessages.seo.home.title,
      frMessages.seo.home.title,
      esMessages.seo.home.title
    ])).toHaveProperty("size", 3);
    expect(new Set(Object.values(MARKETPLACE_META).map((meta) => meta.title))).toHaveProperty("size", 3);

    const guide = getSeoGuide("openclaw-skill-vs-mcp-vs-clawhub");
    expect(new Set([guide.content.en.metaTitle, guide.content.fr.metaTitle, guide.content.es.metaTitle])).toHaveProperty("size", 3);
  });

  it("uses the public price-alert name and a European MCP scope in every locale", () => {
    expect(PRICE_ALERTS_META.en.title).toContain("Price alerts");
    expect(PRICE_ALERTS_META.fr.title).toContain("Bons plans");
    expect(PRICE_ALERTS_META.es.title).toContain("Ofertas");

    for (const meta of Object.values(PRICE_ALERTS_META)) {
      expect(`${meta.title} ${meta.description} ${meta.ogTitle} ${meta.ogDescription}`).not.toMatch(/\bdeals?\b/i);
    }

    expect(MCP_SEO.en.title).toContain("European");
    expect(MCP_SEO.fr.title).toContain("Europe");
    expect(MCP_SEO.es.title).toContain("Europa");
  });
});
