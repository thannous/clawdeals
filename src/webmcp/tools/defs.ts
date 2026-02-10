import type { z } from "zod";

import type { StableToolResult } from "../types";

export type ToolScope = "read" | "write" | "admin";

export type ToolExecutionContext = {
  requestId: string;
  idempotencyKey: string | null;
};

export type ToolDef<TArgs = unknown, TOut = unknown> = {
  name: string;
  description: string;
  scope: ToolScope;
  requiresConfirmation: boolean;
  inputJsonSchema: Record<string, unknown>;
  zodSchema: z.ZodType<TArgs>;
  outputHint: string;
  execute: (args: TArgs, ctx: ToolExecutionContext) => Promise<StableToolResult<TOut>>;
};

