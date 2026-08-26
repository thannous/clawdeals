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
import { clearActiveBuyMission, recordWebMcpActivity, subscribeWebMcpUi } from "./ui-bridge";
import { getStoredApiKey, subscribeStoredApiKey } from "../ui/developer/storage";

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

      const stable = await confirmAndExecute(tool as any, args, {
        confirm: requestConfirmation,
        requestId,
        timeoutMs: 60_000,
        // Stable per tool invocation; allows server-side dedup for write/admin calls.
        idempotencyKey: tool.scope === "read" ? null : requestId,
        signal
      });

      if (stable.ok === false) {
        recordWebMcpActivity({
          toolName: name,
          summary: stable.error.message || "Failed",
          ok: false
        });
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
      recordWebMcpActivity({
        toolName: name,
        summary: tool.outputHint || "Completed",
        ok: true
      });
      return out;
    },
    [requestConfirmation, routeTools]
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
          toolNames: registerable.map((tool) => tool.name)
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
