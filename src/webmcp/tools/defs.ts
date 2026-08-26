import type { z } from "zod";

import type { StableToolResult } from "../types";

export type ToolScope = "read" | "write" | "admin";

export type ToolExecutionContext = {
  requestId: string;
  idempotencyKey: string | null;
  signal?: AbortSignal;
};

export type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
};

export type ToolDef<TArgs = unknown, TOut = unknown> = {
  name: string;
  description: string;
  scope: ToolScope;
  requiresConfirmation: boolean;
  inputJsonSchema: Record<string, unknown>;
  zodSchema: z.ZodType<TArgs>;
  outputHint: string;
  annotations?: ToolAnnotations;
  execute: (args: TArgs, ctx: ToolExecutionContext) => Promise<StableToolResult<TOut>>;
};

