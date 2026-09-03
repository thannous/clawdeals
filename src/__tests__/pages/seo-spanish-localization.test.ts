import { describe, expect, it } from "vitest";

import esMessages from "../../../messages/es.json";
import { MCP_SEO } from "../../pages/mcp";

describe("Spanish marketing metadata", () => {
  it("provides Spanish MCP metadata", () => {
    expect(MCP_SEO.es.title).toContain("Servidor MCP");
    expect(MCP_SEO.es.description).toContain("verifica el primer match");
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
