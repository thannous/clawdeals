import { describe, expect, it } from "vitest";

import { resolveEdgeRouterDecision } from "./edge-router";

describe("edge router decision", () => {
  it.each([
    ["https://clawdeals.com/en", "https://clawdeals.com/"],
    ["https://clawdeals.com/en/guides?topic=mcp", "https://clawdeals.com/guides?topic=mcp"],
    ["https://www.clawdeals.com/en/mcp", "https://clawdeals.com/mcp"],
    ["https://clawdeals.com/en/start", "https://app.clawdeals.com/start"]
  ])("removes the default-locale prefix from %s", (source, location) => {
    expect(resolveEdgeRouterDecision(new URL(source), {})).toEqual({
      type: "redirect",
      status: 308,
      location
    });
  });

  it("redirects www host to canonical marketing host", () => {
    const decision = resolveEdgeRouterDecision(new URL("https://www.clawdeals.com/fr/guide?x=1"), {});

    expect(decision).toEqual({
      type: "redirect",
      status: 308,
      location: "https://clawdeals.com/fr/guide?x=1"
    });
  });

  it("redirects app sections on marketing host to app origin", () => {
    const decision = resolveEdgeRouterDecision(new URL("https://clawdeals.com/fr/deals?tab=latest"), {});

    expect(decision).toEqual({
      type: "redirect",
      status: 308,
      location: "https://app.clawdeals.com/fr/deals?tab=latest"
    });
  });

  it.each([
    ["https://clawdeals.com/my/deals?status=active", "https://app.clawdeals.com/my/deals?status=active"],
    ["https://clawdeals.com/fr/my/offers", "https://app.clawdeals.com/fr/my/offers"],
    ["https://clawdeals.com/pair?token=cd_pair_123", "https://app.clawdeals.com/pair?token=cd_pair_123"],
    ["https://clawdeals.com/keys", "https://app.clawdeals.com/keys"]
  ])("redirects app-only route %s on marketing host to app origin", (source, location) => {
    const decision = resolveEdgeRouterDecision(new URL(source), {});

    expect(decision).toEqual({
      type: "redirect",
      status: 308,
      location
    });
  });

  it("passes app host app routes through to the app origin", () => {
    const decision = resolveEdgeRouterDecision(new URL("https://app.clawdeals.com/my/deals"), {});

    expect(decision).toEqual({ type: "pass" });
  });

  it("proxies /api requests to app origin to preserve same-origin browser flows", () => {
    const decision = resolveEdgeRouterDecision(new URL("https://clawdeals.com/api/v1/watchlist-signups"), {});

    expect(decision).toEqual({
      type: "proxy",
      target: "https://app.clawdeals.com/api/v1/watchlist-signups"
    });
  });

  it("proxies marketing pages to MARKETING_ORIGIN", () => {
    const decision = resolveEdgeRouterDecision(new URL("https://clawdeals.com/fr"), {
      MARKETING_ORIGIN: "https://clawdeals.vercel.app"
    });

    expect(decision).toEqual({
      type: "proxy",
      target: "https://clawdeals.vercel.app/fr"
    });
  });

  it("returns error when MARKETING_ORIGIN points back to routed host", () => {
    const decision = resolveEdgeRouterDecision(new URL("https://clawdeals.com/"), {
      MARKETING_ORIGIN: "https://clawdeals.com"
    });

    expect(decision).toEqual({
      type: "error",
      status: 500,
      message: "MARKETING_ORIGIN must not point to the routed marketing host; use a direct origin host."
    });
  });

  it("passes through unknown hosts", () => {
    const decision = resolveEdgeRouterDecision(new URL("https://staging.app.clawdeals.com/start"), {});
    expect(decision).toEqual({ type: "pass" });
  });
});
