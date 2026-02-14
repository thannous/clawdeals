import { describe, expect, it } from "vitest";

import { safeRedirectUrl } from "./safeRedirect";

describe("safeRedirectUrl", () => {
  it("returns default for non-string input", () => {
    expect(safeRedirectUrl(undefined)).toBe("/settings/account");
    expect(safeRedirectUrl(null)).toBe("/settings/account");
    expect(safeRedirectUrl(42)).toBe("/settings/account");
    expect(safeRedirectUrl({})).toBe("/settings/account");
  });

  it("returns default for empty or whitespace string", () => {
    expect(safeRedirectUrl("")).toBe("/settings/account");
    expect(safeRedirectUrl("   ")).toBe("/settings/account");
  });

  it("accepts allowed prefixes", () => {
    expect(safeRedirectUrl("/claim/abc-123")).toBe("/claim/abc-123");
    expect(safeRedirectUrl("/settings/account")).toBe("/settings/account");
    expect(safeRedirectUrl("/settings/agents")).toBe("/settings/agents");
    expect(safeRedirectUrl("/start")).toBe("/start");
    expect(safeRedirectUrl("/deals")).toBe("/deals");
    expect(safeRedirectUrl("/deals/abc")).toBe("/deals/abc");
    expect(safeRedirectUrl("/console")).toBe("/console");
    expect(safeRedirectUrl("/explore")).toBe("/explore");
    expect(safeRedirectUrl("/auth/login")).toBe("/auth/login");
  });

  it("accepts locale-prefixed allowed routes", () => {
    expect(safeRedirectUrl("/fr/settings/connected-apps")).toBe("/fr/settings/connected-apps");
    expect(safeRedirectUrl("/en-US/claim/abc-123?step=2")).toBe("/en-US/claim/abc-123?step=2");
    expect(safeRedirectUrl("/fr/deals#active")).toBe("/fr/deals#active");
  });

  it("rejects paths not in allowed prefixes", () => {
    expect(safeRedirectUrl("/admin")).toBe("/settings/account");
    expect(safeRedirectUrl("/foo")).toBe("/settings/account");
    expect(safeRedirectUrl("/api/v1/something")).toBe("/settings/account");
  });

  it("rejects traversal attempts that escape allowed routes", () => {
    expect(safeRedirectUrl("/settings/../admin")).toBe("/settings/account");
    expect(safeRedirectUrl("/settings/%2E%2E/admin")).toBe("/settings/account");
    expect(safeRedirectUrl("/fr/settings/../../admin")).toBe("/settings/account");
  });

  it("blocks protocol-relative URLs (//)", () => {
    expect(safeRedirectUrl("//evil.com")).toBe("/settings/account");
    expect(safeRedirectUrl("//evil.com/claim/x")).toBe("/settings/account");
  });

  it("blocks absolute URLs with protocol", () => {
    expect(safeRedirectUrl("https://evil.com")).toBe("/settings/account");
    expect(safeRedirectUrl("http://evil.com/claim/x")).toBe("/settings/account");
    expect(safeRedirectUrl("javascript:alert(1)")).toBe("/settings/account");
    expect(safeRedirectUrl("data:text/html,<h1>hi</h1>")).toBe("/settings/account");
  });

  it("blocks paths without leading slash", () => {
    expect(safeRedirectUrl("claim/abc")).toBe("/settings/account");
    expect(safeRedirectUrl("settings/account")).toBe("/settings/account");
  });

  it("blocks control characters", () => {
    expect(safeRedirectUrl("/claim/\x00abc")).toBe("/settings/account");
    expect(safeRedirectUrl("/claim/\nabc")).toBe("/settings/account");
  });

  it("trims whitespace before validating", () => {
    expect(safeRedirectUrl("  /claim/abc  ")).toBe("/claim/abc");
  });
});
