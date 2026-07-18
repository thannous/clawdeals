import { describe, expect, it } from "vitest";
import { TOOLS } from "../../../packages/clawdeals-mcp/mcp/tools.mjs";
import { DEALWATCH_COPY, SEO as DEALWATCH_SEO } from "../../pages/guides/openclaw-dealwatch";
import {
  OPENCLAW_INTEGRATION_COPY,
  OPENCLAW_MCP_TOOL_COUNT,
  SEO as OPENCLAW_INTEGRATION_SEO
} from "../../pages/integrations/openclaw";

const LOCALES = ["fr", "en", "es"] as const;

describe("OpenClaw marketing content", () => {
  it("keeps DealWatch examples aligned with the multi-market API contract", () => {
    const expectedMarkets = { fr: "FR", en: "GB", es: "ES" } as const;
    const expectedCurrencies = { fr: "EUR", en: "GBP", es: "EUR" } as const;

    for (const locale of LOCALES) {
      const copy = DEALWATCH_COPY[locale];
      const watchlist = copy.sections.step1.code.lines.join("\n");
      const sse = copy.sections.step2.code.lines.join("\n");
      const policyGate = copy.sections.step3.code.lines.join("\n");
      const approval = copy.sections.step4.code.lines.join("\n");

      expect(watchlist).toContain('"criteria": {');
      expect(watchlist).toContain(`"market_code": "${expectedMarkets[locale]}"`);
      expect(watchlist).toContain('"lon":');
      expect(watchlist).toContain('"distance_km": 50');
      expect(watchlist).not.toContain('"lng":');
      expect(watchlist).not.toContain('"radius_km":');

      expect(sse).toContain('"entity": { "type": "listing"');
      expect(sse).toContain('"listing_id":');
      expect(sse).toContain(`"market_code": "${expectedMarkets[locale]}"`);
      expect(sse).toContain('"watchlist_ids":');
      expect(sse).toContain('"watchlist_ids_truncated": false');
      expect(sse).toContain("/api/v1/listings/2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34");
      expect(sse).not.toContain('"deal_id":');
      expect(sse).not.toContain('"watchlist_id":');
      expect(sse).not.toContain('"title":');
      expect(sse).not.toContain('"price":');
      expect(sse).not.toContain('"score":');
      expect(sse).not.toContain('"matched_tags":');
      expect(JSON.stringify(copy.sections.sequence.timeline)).not.toContain("score");

      expect(policyGate).toContain("/v1/listings/2b8f6e4d-3c1a-4a9e-8f72-1d5c7b9a0e34/offers");
      expect(policyGate).toContain('"expires_at":');
      expect(policyGate).toContain('"code": "APPROVAL_REQUIRED"');
      expect(policyGate).toContain('"reason": "policy_requires_approval"');
      expect(policyGate).not.toContain("score");
      expect(policyGate).not.toContain("/v1/approvals/6d1e2f3a-4b5c-4d6e-8f70-123456789abc:approve");

      expect(approval).toContain("/v1/approvals/6d1e2f3a-4b5c-4d6e-8f70-123456789abc:approve");
      expect(approval).toContain("Idempotency-Key: approval-appr-x7m2-001");
      expect(approval).toContain("cd_owner_session=$CLAWDEALS_OWNER_SESSION");
      expect(approval).toContain("{}");
      expect(approval).not.toContain('"decision"');

      expect(policyGate).toContain(`"currency": "${expectedCurrencies[locale]}"`);
    }
  });

  it("ships dedicated Spanish copy and metadata", () => {
    expect(DEALWATCH_COPY.es.subtitle).toBe("GUÍA DEALWATCH");
    expect(DEALWATCH_COPY.es.sections.step1.title).toContain("Crear una lista");
    expect(DEALWATCH_SEO.es.title).toContain("Lista, alertas y aprobación");

    expect(OPENCLAW_INTEGRATION_COPY.es.subtitle).toBe("INTEGRACIÓN OPENCLAW");
    expect(OPENCLAW_INTEGRATION_COPY.es.sections.install.title).toBe("Tres formas de instalación");
    expect(OPENCLAW_INTEGRATION_SEO.es.title).toContain("Conecta tu agente");
  });

  it("keeps the advertised MCP tool count aligned with the package", () => {
    expect(OPENCLAW_MCP_TOOL_COUNT).toBe(TOOLS.length);
    expect(TOOLS).toHaveLength(19);

    for (const locale of LOCALES) {
      const mcpPath = OPENCLAW_INTEGRATION_COPY[locale].sections.install.paths[1];
      expect(mcpPath.desc).toContain(String(OPENCLAW_MCP_TOOL_COUNT));
    }
  });

  it("keeps the installation guidance aligned with the published skill", () => {
    const serializedCopy = JSON.stringify(OPENCLAW_INTEGRATION_COPY);
    const serializedSeo = JSON.stringify(OPENCLAW_INTEGRATION_SEO);

    expect(`${serializedCopy}${serializedSeo}`).not.toMatch(/3 minutes|3-minute|3 minutos/);

    for (const locale of LOCALES) {
      const copy = OPENCLAW_INTEGRATION_COPY[locale];
      expect(copy.sections.install.paths[0].code).toBe("https://clawdeals.com/skill.md");
      expect(copy.sections.connect.flows[0].label).toContain("OAUTH");
      expect(copy.sections.connect.flows[1].label).toContain("CLAIM LINK");
      expect(copy.sections.install.paths[1].desc).not.toContain("transactions");
    }
  });
});
