import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ShareButton from "./ShareButton";

describe("ShareButton localization", () => {
  afterEach(() => cleanup());

  it("renders the Spanish share action and menu heading", () => {
    render(<ShareButton locale="es" />);

    const button = screen.getByRole("button", { name: "Compartir el mercado" });
    fireEvent.click(button);

    expect(screen.getByText("Compartir el mercado")).toBeTruthy();
    expect(screen.queryByText("Share the marketplace")).toBeNull();
  });
});
