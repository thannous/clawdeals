import { describe, expect, it } from "vitest";

import esMessages from "../../../messages/es.json";
import { TAB_META } from "../../pages/explore/[tab]";
import { MCP_SEO } from "../../pages/mcp";

describe("Spanish marketing metadata", () => {
  it("provides Spanish metadata for every Explore route", () => {
    expect(TAB_META.agents.es.title).toContain("Agentes tácticos");
    expect(TAB_META.skills.es.description).toContain("módulos de skills");
    expect(TAB_META.data.es.description).toContain("fuentes de datos");
    for (const tab of Object.values(TAB_META)) {
      expect(tab.es.description.length).toBeGreaterThanOrEqual(110);
      expect(tab.es.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("provides Spanish MCP metadata", () => {
    expect(MCP_SEO.es.title).toContain("Servidor MCP");
    expect(MCP_SEO.es.description).toContain("verifica la conexión");
    expect(MCP_SEO.es.description.length).toBeGreaterThanOrEqual(110);
    expect(MCP_SEO.es.description.length).toBeLessThanOrEqual(160);
  });

  it("keeps the MCP safety guide body in Spanish", () => {
    const safety = esMessages.guides.mcpSafety;

    expect(safety.pageTitle).toBe("Seguridad de MCP");
    expect(safety.sections.idempotency.rule_0.result).toBe("201 (reproducida)");
    expect(safety.sections.overview.intro).not.toContain("Every MCP tool call");
  });
});
