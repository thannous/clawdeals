import type { z } from "zod";

import type { StableToolResult } from "../types";
import { randomUuid } from "../utils";
import type { ConfirmDecision, ConfirmRequest } from "./types";
import type { ToolDef, ToolExecutionContext } from "../tools/defs";

function stableError<T = unknown>(
  requestId: string,
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): StableToolResult<T> {
  return { ok: false, error: { code, message, details }, meta: { request_id: requestId } };
}

export type ConfirmFn = (req: ConfirmRequest) => Promise<ConfirmDecision>;

export async function confirmAndExecute<TArgs, TOut>(
  tool: ToolDef<TArgs, TOut>,
  rawArgs: unknown,
  {
    confirm,
    requestId,
    timeoutMs = 60_000,
    idempotencyKey,
    signal
  }: {
    confirm: ConfirmFn;
    requestId?: string;
    timeoutMs?: number;
    idempotencyKey?: string | null;
    signal?: AbortSignal;
  }
): Promise<StableToolResult<TOut>> {
  const resolvedRequestId = requestId || randomUuid();

  if (signal?.aborted) {
    return stableError(resolvedRequestId, "ABORTED", "Cancelled");
  }

  let parsed: TArgs;
  try {
    parsed = tool.zodSchema.parse(rawArgs) as TArgs;
  } catch (error: any) {
    const message =
      typeof (error as z.ZodError)?.message === "string" ? String((error as any).message) : "Invalid tool input";
    return stableError(resolvedRequestId, "VALIDATION_ERROR", message);
  }

  const needsConfirm = tool.requiresConfirmation === true;
  const isWriteLike = tool.scope === "write" || tool.scope === "admin";

  if (!needsConfirm) {
    const ctx: ToolExecutionContext = {
      requestId: resolvedRequestId,
      idempotencyKey: idempotencyKey || null,
      signal
    };
    return tool.execute(parsed, ctx) as any;
  }

  if (isWriteLike && !confirm) {
    return stableError(resolvedRequestId, "ERROR", "Confirmation gate is not available");
  }

  const decision = await confirm({
    toolName: tool.name,
    toolDescription: tool.description,
    toolScope: tool.scope,
    outputHint: tool.outputHint,
    args: parsed,
    requestId: resolvedRequestId,
    timeoutMs
  });

  if (decision.kind === "deny") {
    return stableError(resolvedRequestId, decision.code, "User denied tool execution", { reason: decision.reason });
  }

  let approvedArgs: TArgs;
  try {
    approvedArgs = tool.zodSchema.parse(decision.args) as TArgs;
  } catch (error: any) {
    const message = typeof error?.message === "string" ? String(error.message) : "Invalid edited tool input";
    return stableError(resolvedRequestId, "VALIDATION_ERROR", message);
  }

  if (signal?.aborted) {
    return stableError(resolvedRequestId, "ABORTED", "Cancelled");
  }

  const ctx: ToolExecutionContext = {
    requestId: resolvedRequestId,
    idempotencyKey: idempotencyKey || randomUuid(),
    signal
  };

  return tool.execute(approvedArgs, ctx) as any;
}
