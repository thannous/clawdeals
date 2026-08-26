/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";

import {
  applyListingsSearchUi,
  getPageContext,
  listingsHref,
  subscribeWebMcpUi
} from "./ui-bridge";

describe("webmcp ui bridge", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("builds a listings href from filters", () => {
    expect(listingsHref({ q: "gpu", price_max: 20000, sort: "price_asc" })).toBe(
      "/browse?q=gpu&price_max=20000&sort=price_asc"
    );
  });

  it("publishes filter events and navigates when not on a listings surface", () => {
    const seen: any[] = [];
    const stop = subscribeWebMcpUi((command) => seen.push(command));
    applyListingsSearchUi({ q: "bike" });
    stop();
    expect(seen.some((command) => command.type === "filter_listings")).toBe(true);
    expect(seen.some((command) => command.type === "navigate" && command.href === "/browse?q=bike")).toBe(true);
  });

  it("reads page context from window.location", () => {
    window.history.replaceState({}, "", "/webmcp?q=ssd");
    const ctx = getPageContext();
    expect(ctx.path).toBe("/webmcp");
    expect(ctx.query.q).toBe("ssd");
  });
});
