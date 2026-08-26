import type { ToolDef } from "./defs";
import { collabTools } from "./collab-tools";
import { readTools } from "./read-tools";
import { writeTools } from "./write-tools";

export const WEBMCP_TOOLS: ToolDef[] = [...collabTools, ...readTools, ...writeTools];

export function getToolByName(name: string): ToolDef | null {
  return WEBMCP_TOOLS.find((t) => t.name === name) || null;
}

