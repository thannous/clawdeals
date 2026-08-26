import type { ToolDef } from "./defs";
import { collabTools } from "./collab-tools";
import { readTools } from "./read-tools";
import { writeTools } from "./write-tools";
import { missionTools } from "./mission-tools";
import { negotiationTools } from "./negotiation-tools";
import { isDealsSurface, isDemoRoute, isDevPlaygroundRoute, isListingsSurface } from "../config";

export const WEBMCP_TOOLS: ToolDef[] = [
  ...collabTools,
  ...missionTools,
  ...negotiationTools,
  ...readTools,
  ...writeTools
];

const LISTINGS_TOOL_NAMES = new Set([
  "get_page_context",
  "search_listings",
  "show_listings",
  "open_listing"
]);

const DEALS_TOOL_NAMES = new Set([
  "get_page_context",
  "search_deals",
  "open_deal"
]);

const OWNER_APPROVAL_TOOL_NAMES = new Set(["get_page_context"]);

const LISTING_NEGOTIATION_TOOL_NAMES = ["start_thread", "make_offer"];
const DEMO_NEGOTIATION_TOOL_NAMES = negotiationTools.map((tool) => tool.name);

type ToolRouteContext = {
  hasAgentKey?: boolean;
};

function selectTools(names: ReadonlySet<string>): ToolDef[] {
  return WEBMCP_TOOLS.filter((tool) => names.has(tool.name));
}

export function getToolsForRoute(pathname: string, context: ToolRouteContext = {}): ToolDef[] {
  const path = String(pathname || "");
  if (isDevPlaygroundRoute(path)) return [...WEBMCP_TOOLS];
  if (path === "/my/approvals" || path.startsWith("/my/approvals/")) {
    return selectTools(OWNER_APPROVAL_TOOL_NAMES);
  }
  if (isDealsSurface(path)) return selectTools(DEALS_TOOL_NAMES);
  if (isDemoRoute(path) || isListingsSurface(path)) {
    const names = new Set(LISTINGS_TOOL_NAMES);
    if (context.hasAgentKey) {
      names.add("create_buy_mission");
      const contextualWrites = isDemoRoute(path)
        ? DEMO_NEGOTIATION_TOOL_NAMES
        : LISTING_NEGOTIATION_TOOL_NAMES;
      for (const name of contextualWrites) names.add(name);
    }
    return selectTools(names);
  }
  return [];
}

export function getToolByName(name: string, tools: readonly ToolDef[]): ToolDef | null {
  return tools.find((tool) => tool.name === name) || null;
}
