import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import LocalizedMarketContext, {
  LOCALIZED_MARKET_CONTEXT,
  type LocalizedMarketContextKey
} from "./LocalizedMarketContext";

const CONTEXTS: LocalizedMarketContextKey[] = [
  "landing",
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

  it("renders localized market proof and a localized DealWatch link", () => {
    render(<LocalizedMarketContext locale="es" context="mcp" />);

    expect(screen.getByText("Crear recursos MCP vinculados explícitamente a España")).toBeTruthy();
    expect(screen.getByText("market_code=ES · currency=EUR")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/es/guides/openclaw-dealwatch");
  });

  it("does not add a generic market block to the English page", () => {
    const { container } = render(<LocalizedMarketContext locale="en" context="landing" />);

    expect(container.innerHTML).toBe("");
  });
});
