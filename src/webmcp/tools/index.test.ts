import { describe, expect, it } from "vitest";

import { getToolByName, getToolsForRoute, WEBMCP_TOOLS } from ".";

function namesFor(pathname: string): string[] {
  return getToolsForRoute(pathname).map((tool) => tool.name);
}

const FORBIDDEN_PUBLIC_TOOLS = [
  "clawdeals.listings_create_draft",
  "clawdeals.approvals_resolve",
  "clawdeals.approvals_list",
  "clawdeals.approvals_get"
];

describe("contextual WebMCP tool registry", () => {
  it("exposes only listing collaboration tools on listing surfaces", () => {
    const expected = ["get_page_context", "show_listings", "open_listing", "search_listings"];
    expect(namesFor("/webmcp")).toEqual(expected);
    expect(namesFor("/browse")).toEqual(expected);
    expect(namesFor("/browse/00000000-0000-4000-8000-000000000001")).toEqual(expected);
    expect(namesFor("/marketplace")).toEqual(expected);
  });

  it("exposes only deal collaboration tools on deal surfaces", () => {
    const expected = ["get_page_context", "open_deal", "search_deals"];
    expect(namesFor("/browse/deals")).toEqual(expected);
    expect(namesFor("/deals/00000000-0000-4000-8000-000000000001")).toEqual(expected);
  });

  it("does not expose agent-key approval tools to the owner approvals surface", () => {
    expect(namesFor("/my/approvals")).toEqual(["get_page_context"]);
    expect(namesFor("/my/approvals/00000000-0000-4000-8000-000000000001")).toEqual([
      "get_page_context"
    ]);
  });

  it("never exposes authenticated, write, or admin tools on public surfaces", () => {
    for (const pathname of ["/webmcp", "/browse", "/browse/deals", "/deals", "/marketplace"]) {
      const tools = getToolsForRoute(pathname);
      expect(tools.every((tool) => tool.scope === "read")).toBe(true);
      expect(tools.map((tool) => tool.name)).not.toEqual(
        expect.arrayContaining(FORBIDDEN_PUBLIC_TOOLS)
      );
    }
  });

  it("exposes the complete registry only on developer routes", () => {
    expect(namesFor("/dev/webmcp")).toEqual(WEBMCP_TOOLS.map((tool) => tool.name));
    expect(namesFor("/developer/tools")).toEqual(WEBMCP_TOOLS.map((tool) => tool.name));
    expect(namesFor("/")).toEqual([]);
    expect(namesFor("/my/listings")).toEqual([]);
  });

  it("resolves tool execution only inside the selected route registry", () => {
    const publicTools = getToolsForRoute("/browse");
    expect(getToolByName("search_listings", publicTools)?.name).toBe("search_listings");
    expect(getToolByName("clawdeals.approvals_resolve", publicTools)).toBeNull();
  });
});
