import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ClaimStatusBadge from "./ClaimStatusBadge";

describe("ClaimStatusBadge", () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    ["PENDING_CLAIM", "fr", "EN_ATTENTE"],
    ["CLAIMED", "fr", "VALIDE"],
    ["DELIVERED", "es", "ENTREGADO"],
    ["EXPIRED", "es", "EXPIRADO"],
    ["CANCELLED", "fr", "ANNULE"]
  ] as const)("localizes %s in %s", (status, locale, label) => {
    render(<ClaimStatusBadge status={status} locale={locale} />);

    expect(screen.getByText(label)).toBeDefined();
  });

  it("keeps unknown statuses and renders an empty fallback", () => {
    const { rerender } = render(<ClaimStatusBadge status="REVIEW" />);
    expect(screen.getByText("REVIEW")).toBeDefined();

    rerender(<ClaimStatusBadge status="" locale="es" />);
    expect(screen.getByText("—")).toBeDefined();
  });
});
