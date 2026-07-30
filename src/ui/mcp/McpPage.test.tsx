import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../messages/en.json";
import frMessages from "../../../messages/fr.json";
import esMessages from "../../../messages/es.json";

const mockRouter = vi.hoisted(() => ({ locale: "es" }));
const messagesByLocale = { en: enMessages, fr: frMessages, es: esMessages };

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: mockRouter.locale })
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const path = `${namespace}.${key}`.split(".");
    let value: unknown = messagesByLocale[mockRouter.locale as keyof typeof messagesByLocale];
    for (const segment of path) {
      value = (value as Record<string, unknown>)[segment];
    }
    return String(value);
  }
}));

import McpPage from "./McpPage";

describe("McpPage localization", () => {
  afterEach(() => {
    cleanup();
    mockRouter.locale = "es";
  });

  it("renders the Spanish quick start and operational guidance", () => {
    render(<McpPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Servidor MCP ClawDeals para agentes de IA en España"
    );
    expect(screen.getByText("Inicio rápido")).toBeTruthy();
    expect(screen.getByText("Obtén tu clave API")).toBeTruthy();
    expect(screen.getByText("Prueba de escritura (opcional)")).toBeTruthy();
    expect(screen.getByTestId("activation-path-mcp").textContent).toContain("FR/EUR, GB/GBP o ES/EUR");
    expect(screen.getByTestId("activation-path-mcp").textContent).toContain("catálogo fijo");
    expect(screen.getAllByText("Herramientas").length).toBeGreaterThan(0);
    expect(screen.queryByText("Quick Start")).toBeNull();
    expect(screen.queryByText("Write smoke (optional)")).toBeNull();
  });

  it("renders French labels and examples without English example prose", () => {
    mockRouter.locale = "fr";
    const { container } = render(<McpPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Serveur MCP ClawDeals pour agents IA en France"
    );
    expect(container.textContent).toContain("Configuration FR/EUR guidée");
    expect(container.textContent).toContain("Appelle : clawdeals.deals.list");
    expect(container.textContent).toContain("Outil : clawdeals.deals.create");
    expect(container.textContent).toContain('"currency": "EUR"');
    expect(container.textContent).toContain('"market_code": "FR"');
    expect(screen.getByTestId("activation-path-mcp").textContent).toContain("premier match");
    expect(container.textContent).not.toContain("MCP SMOKE TEST");
  });

  it("uses GBP in the English write example and makes no duration guarantee", () => {
    mockRouter.locale = "en";
    const { container } = render(<McpPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "ClawDeals MCP server for UK AI agents"
    );
    expect(container.textContent).toContain("GB/GBP guided setup");
    expect(container.textContent).toContain('"currency": "GBP"');
    expect(container.textContent).toContain('"market_code": "GB"');
    expect(screen.getByTestId("activation-path-mcp").textContent).toContain("first verified match");
    expect(container.textContent).not.toContain("3 minutes");
  });
});
