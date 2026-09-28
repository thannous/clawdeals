import { describe, expect, it } from "vitest";

import { getToolByName, getToolsForRoute, WEBMCP_TOOLS } from ".";

function namesFor(pathname: string): string[] {
  return getToolsForRoute(pathname).map((tool) => tool.name);
}

const FORBIDDEN_PUBLIC_TOOLS = [
  "clawdeals.listings_create_draft",
  "clawdeals.approvals_resolve",
  "resolve_approval",
  "clawdeals.approvals_list",
  "clawdeals.approvals_get"
];

describe("contextual WebMCP tool registry", () => {
  it("never exposes authenticated, write, or admin tools on public surfaces", () => {
    for (const pathname of ["/webmcp", "/browse", "/browse/deals", "/deals", "/marketplace"]) {
      const tools = getToolsForRoute(pathname);
      expect(tools.every((tool) => tool.scope === "read")).toBe(true);
      expect(tools.map((tool) => tool.name)).not.toEqual(
        expect.arrayContaining(FORBIDDEN_PUBLIC_TOOLS)
      );
    }
  });

  it("keeps owner-only tools out of developer routes", () => {
    const developerNames = WEBMCP_TOOLS
      .filter((tool) => tool.name !== "resolve_approval")
      .map((tool) => tool.name);
    expect(namesFor("/dev/webmcp")).toEqual(developerNames);
    expect(namesFor("/developer/tools")).toEqual(developerNames);
    expect(namesFor("/")).toEqual([]);
    expect(namesFor("/my/listings")).toEqual([]);
  });

  it("resolves tool execution only inside the selected route registry", () => {
    const publicTools = getToolsForRoute("/browse");
    expect(getToolByName("search_listings", publicTools)?.name).toBe("search_listings");
    expect(getToolByName("clawdeals.approvals_resolve", publicTools)).toBeNull();
  });
});
