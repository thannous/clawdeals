import type { ToolScope } from "../tools/defs";

export type ConfirmRequest = {
  toolName: string;
  toolDescription: string;
  toolScope: ToolScope;
  outputHint: string;
  args: unknown;
  requestId: string;
  timeoutMs: number;
};

export type ConfirmDecision =
  | { kind: "approve"; args: unknown }
  | { kind: "deny"; code: "USER_DENIED"; reason: string };

export type ConfirmHistoryEntry = {
  requestId: string;
  toolName: string;
  toolScope: ToolScope;
  decidedAt: string;
  decision: "APPROVED" | "DENIED";
  reason: string | null;
};

