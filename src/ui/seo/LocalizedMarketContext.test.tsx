import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import LocalizedMarketContext, {
  LOCALIZED_MARKET_CONTEXT,
  type LocalizedMarketContextKey
} from "./LocalizedMarketContext";

const CONTEXTS: LocalizedMarketContextKey[] = [
  "landing",
  "marketplace",
  "trust",
  "policy",
  "audit",
  "mcp",
  "openclaw",
  "explore-agents",
  "explore-skills",
  "explore-data"
];

describe("LocalizedMarketContext", () => {
  afterEach(cleanup);

  it("keeps every French and Spanish context explicit about its market and currency", () => {
    for (const context of CONTEXTS) {
      expect(LOCALIZED_MARKET_CONTEXT.fr[context].marketCode).toBe("FR");
      expect(LOCALIZED_MARKET_CONTEXT.fr[context].currency).toBe("EUR");
      expect(LOCALIZED_MARKET_CONTEXT.es[context].marketCode).toBe("ES");
      expect(LOCALIZED_MARKET_CONTEXT.es[context].currency).toBe("EUR");
      expect(LOCALIZED_MARKET_CONTEXT.fr[context].title).not.toBe(
        LOCALIZED_MARKET_CONTEXT.es[context].title
      );
    }
  });

  it("renders localized market proof and contextual Spanish paths without a self-link", () => {
    render(<LocalizedMarketContext locale="es" context="mcp" />);

    expect(screen.getByText("Crear recursos MCP vinculados explícitamente a España")).toBeTruthy();
    expect(screen.getByText("market_code=ES · currency=EUR")).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/es/guides/openclaw-dealwatch");
    expect(hrefs).toContain("/es/integrations/openclaw");
    expect(hrefs).toContain("/es/guides");
    expect(hrefs).toContain("/es/browse/deals");
    expect(hrefs).not.toContain("/es/mcp");
  });

  it("links other French market contexts back to the localized MCP page", () => {
    render(<LocalizedMarketContext locale="fr" context="trust" />);

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/fr/mcp");
  });

  it("does not add a generic market block to the English page", () => {
    const { container } = render(<LocalizedMarketContext locale="en" context="landing" />);

    expect(container.innerHTML).toBe("");
  });
});
