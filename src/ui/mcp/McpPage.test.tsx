import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import esMessages from "../../../messages/es.json";

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "es" })
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const path = `${namespace}.${key}`.split(".");
    let value: unknown = esMessages;
    for (const segment of path) {
      value = (value as Record<string, unknown>)[segment];
    }
    return String(value);
  }
}));

import McpPage from "./McpPage";

describe("McpPage Spanish localization", () => {
  afterEach(() => cleanup());

  it("renders the Spanish quick start and operational guidance", () => {
    render(<McpPage />);

    expect(screen.getByText("Inicio rápido")).toBeTruthy();
    expect(screen.getByText("Obtén tu clave API")).toBeTruthy();
    expect(screen.getByText("Prueba de escritura (opcional)")).toBeTruthy();
    expect(screen.getAllByText("Herramientas").length).toBeGreaterThan(0);
    expect(screen.queryByText("Quick Start")).toBeNull();
    expect(screen.queryByText("Write smoke (optional)")).toBeNull();
  });
});
