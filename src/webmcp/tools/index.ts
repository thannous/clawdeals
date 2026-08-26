import type { ToolDef } from "./defs";
import { collabTools } from "./collab-tools";
import { readTools } from "./read-tools";
import { writeTools } from "./write-tools";
import { isDealsSurface, isDemoRoute, isDevPlaygroundRoute, isListingsSurface } from "../config";

export const WEBMCP_TOOLS: ToolDef[] = [...collabTools, ...readTools, ...writeTools];

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

function selectCollabTools(names: ReadonlySet<string>): ToolDef[] {
  return collabTools.filter((tool) => names.has(tool.name));
}

export function getToolsForRoute(pathname: string): ToolDef[] {
  const path = String(pathname || "");
  if (isDevPlaygroundRoute(path)) return [...WEBMCP_TOOLS];
  if (path === "/my/approvals" || path.startsWith("/my/approvals/")) {
    return selectCollabTools(OWNER_APPROVAL_TOOL_NAMES);
  }
  if (isDealsSurface(path)) return selectCollabTools(DEALS_TOOL_NAMES);
  if (isDemoRoute(path) || isListingsSurface(path)) return selectCollabTools(LISTINGS_TOOL_NAMES);
  return [];
}

export function getToolByName(name: string, tools: readonly ToolDef[]): ToolDef | null {
  return tools.find((tool) => tool.name === name) || null;
}
