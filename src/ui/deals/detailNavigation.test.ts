import { describe, expect, it } from "vitest";
import { DEAL_DETAIL_FROM_BROWSE_DEALS, resolveDealBackHref } from "./detailNavigation";

describe("detailNavigation", () => {
  it("returns browse deals when the source is the public browse list", () => {
    expect(resolveDealBackHref(DEAL_DETAIL_FROM_BROWSE_DEALS)).toBe("/browse/deals");
    expect(resolveDealBackHref([DEAL_DETAIL_FROM_BROWSE_DEALS])).toBe("/browse/deals");
  });

  it("falls back to deals page for unknown or missing source", () => {
    expect(resolveDealBackHref(undefined)).toBe("/deals");
    expect(resolveDealBackHref("something-else")).toBe("/deals");
    expect(resolveDealBackHref([])).toBe("/deals");
  });
});
