import { useRouter } from "next/router";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useSyncExternalStore } from "react";

import { registerTools, isWebMCPSupported } from "./adapter";
import { isWebMcpRuntimeEnabled, shouldRegisterOnRoute } from "./config";
import { getToolByName, getToolsForRoute } from "./tools";
import type { StableToolResult } from "./types";
import { capToolOutputBytes, WEBMCP_TOOL_OUTPUT_MAX_BYTES } from "./security/output-cap";
import { sanitizeToolOutput } from "./security/sanitize";
import { randomUuid } from "./utils";
import { confirmAndExecute } from "./confirm/gate";
import { WebMcpConfirmProvider, useWebMcpConfirm } from "./confirm/context";
import ConfirmModalHost from "./confirm/ConfirmModalHost";
import ActivityHud from "./ActivityHud";
import {
  clearActiveBuyMission,
  hydrateWebMcpActionReceipts,
  recordWebMcpActionReceipt,
  subscribeWebMcpUi
} from "./ui-bridge";
import {
  ACTION_RECEIPT_TOOL_VERSION,
  createPendingActionReceipt,
  extractApprovalIds,
  finalizeActionReceipt,
  redactAndHashInput,
  safeReceiptLink,
  sanitizeActionReceipt,
  type ActionReceipt,
  type ActionReceiptActor,
  type ActionReceiptOutcome
} from "./activity/action-receipts";
import { getStoredApiKey, subscribeStoredApiKey } from "../ui/developer/storage";
import type { ToolDef } from "./tools/defs";

type WebMcpContextValue = {
  enabled: boolean;
  supported: boolean;
  registered: boolean;
  registeredToolNames: string[];
  lastRegisterError: string | null;
  executeTool: (name: string, args: unknown, options?: { signal?: AbortSignal }) => Promise<StableToolResult>;
};

const WebMcpContext = createContext<WebMcpContextValue | null>(null);

type RegistrationState = {
  registered: boolean;
  registeredToolNames: string[];
  lastRegisterError: string | null;
};

type RegistrationAction =
  | { type: "register/success"; registeredCount: number; errorCount: number; toolNames: string[] }
  | { type: "register/failure"; message: string }
  | { type: "register/reset" };

const INITIAL_REGISTRATION_STATE: RegistrationState = {
  registered: false,
  registeredToolNames: [],
  lastRegisterError: null
};

const UNKNOWN_OUTCOME_CODES = new Set([
  "ABORTED",
  "ERROR",
  "FETCH_FAILED",
  "NETWORK_ERROR",
  "OUTCOME_UNKNOWN",
  "TIMEOUT"
]);

function receiptActor(tool: ToolDef, hasAgentKey: boolean): ActionReceiptActor {
  if (tool.scope === "admin") return "owner";
  if (hasAgentKey || tool.scope === "write") return "agent";
  return "public";
}

function policyEnforcement(tool: ToolDef): "client_read_boundary" | "server" {
  return tool.scope === "read" ? "client_read_boundary" : "server";
}

function receiptOutcome(result: StableToolResult): ActionReceiptOutcome {
  if (result.ok === true) return "success";
  if (result.error.code === "USER_DENIED") return "denied";
  return UNKNOWN_OUTCOME_CODES.has(result.error.code) ? "unknown" : "denied";
}

function currentReceiptLink(): string | null {
  if (typeof window === "undefined") return null;
  return safeReceiptLink(window.location.pathname);
}

function resultReceiptLink(value: unknown, fallback: string | null): string | null {
  const seen = new WeakSet<object>();
  const visit = (entry: unknown, depth: number): string | null => {
    if (depth > 5 || entry === null || entry === undefined) return null;
    if (typeof entry !== "object") return null;
    if (seen.has(entry as object)) return null;
    seen.add(entry as object);
    if (Array.isArray(entry)) {
      for (const child of entry.slice(0, 20)) {
        const found = visit(child, depth + 1);
        if (found) return found;
      }
      return null;
    }
    for (const [key, child] of Object.entries(entry as Record<string, unknown>)) {
      if (["href", "link", "url"].includes(key) && typeof child === "string") {
        const safe = safeReceiptLink(child);
        if (safe) return safe;
      }
      const found = visit(child, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return visit(value, 0) || fallback;
}

async function pendingReceiptForInvocation(input: {
  requestId: string;
  tool: ToolDef;
  actor: ActionReceiptActor;
  args: unknown;
}): Promise<ActionReceipt> {
  const link = currentReceiptLink();
  const policy = {
    enforcement: policyEnforcement(input.tool),
    scope: input.tool.scope,
    decision: input.tool.requiresConfirmation ? "awaiting_human_confirmation" : "allowed"
  };
  try {
    return await createPendingActionReceipt({
      requestId: input.requestId,
      toolName: input.tool.name,
      toolVersion: ACTION_RECEIPT_TOOL_VERSION,
      actor: input.actor,
      args: input.args,
      policy,
      confirmation: input.tool.requiresConfirmation ? "pending" : "not_required",
      link
    });
  } catch {
    return sanitizeActionReceipt({
      receipt_version: "1",
      receipt_id: `rcpt_${input.requestId}`,
      request_id: input.requestId,
      tool: { name: input.tool.name, version: ACTION_RECEIPT_TOOL_VERSION },
      actor: input.actor,
      arguments_summary: {},
      input_hash: "sha256:unavailable",
      policy,
      confirmation: input.tool.requiresConfirmation ? "pending" : "not_required",
      approval_ids: [],
      outcome: "pending",
      best_effort_error: "receipt_input_hash_failed",
      result: { status: "pending" },
      timestamp: new Date().toISOString(),
      link
    });
  }
}

function registrationReducer(state: RegistrationState, action: RegistrationAction): RegistrationState {
  switch (action.type) {
    case "register/success":
      return {
        registered: action.registeredCount > 0,
        registeredToolNames: action.toolNames,
        lastRegisterError: action.errorCount > 0 ? `${action.errorCount} tool(s) failed to register` : null
      };
    case "register/failure":
      return {
        ...state,
        lastRegisterError: action.message
      };
    case "register/reset":
      return INITIAL_REGISTRATION_STATE;
    default:
      return state;
  }
}

export function useWebMcp() {
  const ctx = useContext(WebMcpContext);
  if (!ctx) throw new Error("useWebMcp must be used within WebMcpProvider");
  return ctx;
}

function WebMcpInnerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { requestConfirmation } = useWebMcpConfirm();

  const enabled = isWebMcpRuntimeEnabled(router.pathname || "");
  const supported = useSyncExternalStore(
    () => () => undefined,
    () => isWebMCPSupported(),
    () => false
  );
  const agentKey = useSyncExternalStore(
    subscribeStoredApiKey,
    getStoredApiKey,
    () => null
  );

  const [registration, dispatchRegistration] = useReducer(registrationReducer, INITIAL_REGISTRATION_STATE);
  const routeTools = useMemo(
    () => getToolsForRoute(router.pathname || "", { hasAgentKey: Boolean(agentKey) }),
    [router.pathname, agentKey]
  );

  useEffect(() => {
    clearActiveBuyMission();
  }, [agentKey]);

  useEffect(() => {
    hydrateWebMcpActionReceipts();
  }, []);

  const executeTool = useCallback(
    async (name: string, args: unknown, options?: { signal?: AbortSignal }): Promise<StableToolResult> => {
      const tool = getToolByName(name, routeTools);
      const requestId = randomUuid();
      const signal = options?.signal;
      if (!tool) {
        return { ok: false, error: { code: "NOT_FOUND", message: `Tool not found: ${name}`, details: {} }, meta: { request_id: requestId } };
      }
      if (signal?.aborted) {
        return { ok: false, error: { code: "ABORTED", message: "Cancelled", details: {} }, meta: { request_id: requestId } };
      }

      let receipt = recordWebMcpActionReceipt(
        await pendingReceiptForInvocation({
          requestId,
          tool,
          actor: receiptActor(tool, Boolean(agentKey)),
          args
        })
      );

      const confirmWithReceipt = async (request: Parameters<typeof requestConfirmation>[0]) => {
        const decision = await requestConfirmation(request);
        if (decision.kind === "approve") {
          try {
            const hashed = await redactAndHashInput(decision.args);
            receipt = recordWebMcpActionReceipt(
              sanitizeActionReceipt({
                ...receipt,
                arguments_summary: hashed.argumentsSummary,
                input_hash: hashed.inputHash,
                confirmation: "approved",
                policy: {
                  enforcement: policyEnforcement(tool),
                  scope: tool.scope,
                  decision: "human_approved"
                },
                result: { status: "executing" },
                timestamp: new Date().toISOString()
              })
            );
          } catch {
            receipt = recordWebMcpActionReceipt(
              sanitizeActionReceipt({
                ...receipt,
                confirmation: "approved",
                best_effort_error: "receipt_edited_input_hash_failed",
                timestamp: new Date().toISOString()
              })
            );
          }
        }
        return decision;
      };

      let stable: StableToolResult;
      try {
        stable = await confirmAndExecute(tool as any, args, {
          confirm: confirmWithReceipt,
          requestId,
          timeoutMs: 60_000,
          // Stable per tool invocation; allows server-side dedup for write/admin calls.
          idempotencyKey: tool.scope === "read" ? null : requestId,
          signal
        });
      } catch {
        stable = {
          ok: false,
          error: {
            code: "OUTCOME_UNKNOWN",
            message: "The action may have completed. Reconcile before retrying.",
            details: { safe_to_retry: false }
          },
          meta: { request_id: requestId }
        };
      }

      if (stable.ok === false) {
        const outcome = receiptOutcome(stable);
        const confirmation =
          tool.requiresConfirmation && stable.error.code === "USER_DENIED"
            ? "denied"
            : receipt.confirmation;
        const policyDecision =
          stable.error.code === "USER_DENIED"
            ? "human_denied"
            : outcome === "unknown"
              ? "outcome_unknown"
              : "server_rejected";
        receipt = recordWebMcpActionReceipt(
          finalizeActionReceipt(
            sanitizeActionReceipt({
              ...receipt,
              policy: {
                enforcement: policyEnforcement(tool),
                scope: tool.scope,
                decision: policyDecision,
                error_code: stable.error.code
              }
            }),
            {
              outcome: outcome === "pending" ? "unknown" : outcome,
              confirmation,
              approvalIds: extractApprovalIds(stable.error.details),
              result: {
                code: stable.error.code,
                message: stable.error.message,
                details: stable.error.details
              },
              link: resultReceiptLink(stable.error.details, receipt.link)
            }
          )
        );
        return stable;
      }

      const sanitized = sanitizeToolOutput(stable.data);
      const capped = capToolOutputBytes(sanitized, { maxBytes: WEBMCP_TOOL_OUTPUT_MAX_BYTES });
      const out = {
        ok: true as const,
        data: capped.value,
        meta: {
          request_id: stable.meta.request_id || requestId,
          ...(capped.truncated ? { truncated: true, max_bytes: capped.maxBytes } : {})
        }
      };
      receipt = recordWebMcpActionReceipt(
        finalizeActionReceipt(
          sanitizeActionReceipt({
            ...receipt,
            policy: {
              enforcement: policyEnforcement(tool),
              scope: tool.scope,
              decision: tool.requiresConfirmation
                ? "human_approved_and_server_accepted"
                : tool.scope === "read"
                  ? "read_completed"
                  : "server_accepted"
            }
          }),
          {
            outcome: "success",
            confirmation: tool.requiresConfirmation ? "approved" : "not_required",
            approvalIds: extractApprovalIds(capped.value),
            result: capped.value,
            link: resultReceiptLink(capped.value, receipt.link)
          }
        )
      );
      return out;
    },
    [agentKey, requestConfirmation, routeTools]
  );

  useEffect(() => {
    return subscribeWebMcpUi((command) => {
      if (command.type === "navigate" && command.href) {
        void router.push(command.href);
      }
    });
  }, [router]);

  useEffect(() => {
    let alive = true;
    if (!enabled || !supported) {
      dispatchRegistration({ type: "register/reset" });
      return;
    }

    const pathname = router.pathname || "";
    if (!shouldRegisterOnRoute(pathname) || routeTools.length === 0) {
      dispatchRegistration({ type: "register/reset" });
      return;
    }

    const controller = new AbortController();

    const registerable = routeTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputJsonSchema,
      annotations: t.annotations || {
        readOnlyHint: t.scope === "read" && !t.requiresConfirmation,
        untrustedContentHint: false
      },
      execute: async (toolArgs: any, options?: { signal?: AbortSignal }) => {
        if (options?.signal?.aborted) {
          return { ok: false, error: { code: "ABORTED", message: "Cancelled", details: {} }, meta: { request_id: randomUuid() } };
        }
        const result = await executeTool(t.name, toolArgs || {}, { signal: options?.signal });
        return result;
      }
    }));

    registerTools(registerable, { signal: controller.signal })
      .then((result) => {
        if (!alive) return;
        dispatchRegistration({
          type: "register/success",
          registeredCount: result.registered,
          errorCount: result.errors,
          toolNames: result.registeredToolNames
        });
      })
      .catch((error: any) => {
        if (!alive) return;
        dispatchRegistration({ type: "register/failure", message: error?.message || "Tool registration failed" });
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [router.pathname, enabled, supported, executeTool, routeTools]);

  const value = useMemo<WebMcpContextValue>(
    () => ({
      enabled,
      supported,
      registered: registration.registered,
      registeredToolNames: registration.registeredToolNames,
      lastRegisterError: registration.lastRegisterError,
      executeTool
    }),
    [enabled, supported, registration, executeTool]
  );

  return (
    <WebMcpContext.Provider value={value}>
      {children}
      <ConfirmModalHost />
      <ActivityHud />
    </WebMcpContext.Provider>
  );
}

export default function WebMcpProvider({ children }: { children: React.ReactNode }) {
  return (
    <WebMcpConfirmProvider>
      <WebMcpInnerProvider>{children}</WebMcpInnerProvider>
    </WebMcpConfirmProvider>
  );
}
