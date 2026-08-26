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
  it("exposes only listing collaboration tools on listing surfaces", () => {
    const expected = ["get_page_context", "show_listings", "open_listing", "search_listings"];
    expect(namesFor("/webmcp")).toEqual([...expected, "get_action_receipt"]);
    expect(namesFor("/webmcp-challenge")).toEqual([...expected, "get_action_receipt"]);
    expect(namesFor("/browse")).toEqual(expected);
    expect(namesFor("/browse/00000000-0000-4000-8000-000000000001")).toEqual(expected);
    expect(namesFor("/marketplace")).toEqual(expected);
  });

  it("adds only contextual mission and negotiation writes when an agent key is present", () => {
    const expected = [
      "get_page_context",
      "show_listings",
      "open_listing",
      "search_listings",
      "create_buy_mission",
      "start_thread",
      "send_message",
      "make_offer",
      "respond_to_offer",
      "request_contact_reveal",
      "get_action_receipt"
    ];
    expect(getToolsForRoute("/webmcp", { hasAgentKey: true }).map((tool) => tool.name)).toEqual(
      expected
    );
    expect(
      getToolsForRoute("/webmcp-challenge", { hasAgentKey: true }).map((tool) => tool.name)
    ).toEqual(expected);
    expect(
      getToolByName(
        "clawdeals.listings_create_draft",
        getToolsForRoute("/webmcp", { hasAgentKey: true })
      )
    ).toBeNull();
    expect(
      getToolByName(
        "clawdeals.approvals_resolve",
        getToolsForRoute("/webmcp", { hasAgentKey: true })
      )
    ).toBeNull();
    expect(getToolsForRoute("/browse", { hasAgentKey: true }).map((tool) => tool.name)).toEqual([
      "get_page_context",
      "show_listings",
      "open_listing",
      "search_listings",
      "create_buy_mission",
      "start_thread",
      "make_offer"
    ]);
  });

  it("exposes only deal collaboration tools on deal surfaces", () => {
    const expected = ["get_page_context", "open_deal", "search_deals"];
    expect(namesFor("/browse/deals")).toEqual(expected);
    expect(namesFor("/deals/00000000-0000-4000-8000-000000000001")).toEqual(expected);
  });

  it("exposes owner-session resolution only on a specific approval page", () => {
    expect(namesFor("/my/approvals")).toEqual(["get_page_context"]);
    expect(namesFor("/my/approvals/00000000-0000-4000-8000-000000000001")).toEqual([
      "get_page_context",
      "resolve_approval",
      "get_action_receipt"
    ]);
    expect(namesFor("/browse")).not.toContain("resolve_approval");
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

  it("uses only official annotation fields and marks marketplace content untrusted", () => {
    for (const tool of WEBMCP_TOOLS) {
      expect(Object.keys(tool.annotations || {}).sort()).toEqual(
        expect.arrayContaining(["readOnlyHint", "untrustedContentHint"])
      );
      expect(tool.annotations).not.toHaveProperty("destructiveHint");
      expect(tool.annotations).not.toHaveProperty("openWorldHint");
    }

    expect(getToolByName("search_listings", getToolsForRoute("/browse"))?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true
    });
    expect(getToolByName("search_deals", getToolsForRoute("/deals"))?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true
    });
  });
});
