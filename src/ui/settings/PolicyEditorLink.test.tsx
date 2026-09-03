import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ gate: "anonymous" }));

vi.mock("../auth/useOwnerSessionGate", () => ({
  useOwnerSessionGate: () => state.gate
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({ title: "Owner controls available", description: "Review your policy.", cta: "Edit my policy" })[key] || key
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

import PolicyEditorLink from "./PolicyEditorLink";

describe("PolicyEditorLink", () => {
  afterEach(() => cleanup());

  it("links connected owners from the marketing explanation to the editor", () => {
    state.gate = "authenticated";
    render(<PolicyEditorLink />);

    expect(screen.getByTestId("policy-control-owner-link")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit my policy" }).getAttribute("href")).toBe("/settings/policy");
  });

  it("stays hidden for anonymous visitors", () => {
    state.gate = "anonymous";
    render(<PolicyEditorLink />);
    expect(screen.queryByTestId("policy-control-owner-link")).toBeNull();
  });
});
