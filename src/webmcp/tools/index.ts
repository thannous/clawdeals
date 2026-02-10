import type { ToolDef } from "./defs";
import { readTools } from "./read-tools";
import { writeTools } from "./write-tools";

export const WEBMCP_TOOLS: ToolDef[] = [...readTools, ...writeTools];

export function getToolByName(name: string): ToolDef | null {
  return WEBMCP_TOOLS.find((t) => t.name === name) || null;
}

