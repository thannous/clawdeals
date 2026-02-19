import { useRouter } from "next/router";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";

import { registerTools, isWebMCPSupported } from "./adapter";
import { isWebMcpEnabled, shouldRegisterOnRoute } from "./config";
import { WEBMCP_TOOLS, getToolByName } from "./tools";
import type { StableToolResult } from "./types";
import { capToolOutputBytes } from "./security/output-cap";
import { sanitizeToolOutput } from "./security/sanitize";
import { randomUuid } from "./utils";
import { confirmAndExecute } from "./confirm/gate";
import { WebMcpConfirmProvider, useWebMcpConfirm } from "./confirm/context";
import ConfirmModalHost from "./confirm/ConfirmModalHost";

type WebMcpContextValue = {
  enabled: boolean;
  supported: boolean;
  registered: boolean;
  registeredToolNames: string[];
  lastRegisterError: string | null;
  executeTool: (name: string, args: unknown) => Promise<StableToolResult>;
};

const WebMcpContext = createContext<WebMcpContextValue | null>(null);

type RegistrationState = {
  registered: boolean;
  registeredToolNames: string[];
  lastRegisterError: string | null;
};

type RegistrationAction =
  | { type: "register/success"; registeredCount: number; errorCount: number; toolNames: string[] }
  | { type: "register/failure"; message: string };

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

  const enabled = isWebMcpEnabled();
  const supported = typeof window !== "undefined" ? isWebMCPSupported() : false;

  const [registration, dispatchRegistration] = useReducer(registrationReducer, INITIAL_REGISTRATION_STATE);

  const didRegisterRef = useRef(false);

  const executeTool = useCallback(
    async (name: string, args: unknown): Promise<StableToolResult> => {
      const tool = getToolByName(name);
      const requestId = randomUuid();
      if (!tool) {
        return { ok: false, error: { code: "NOT_FOUND", message: `Tool not found: ${name}`, details: {} }, meta: { request_id: requestId } };
      }

      const stable = await confirmAndExecute(tool as any, args, {
        confirm: requestConfirmation,
        requestId,
        timeoutMs: 60_000,
        // Stable per tool invocation; allows server-side dedup for write/admin calls.
        idempotencyKey: tool.scope === "read" ? null : requestId
      });

      if (!stable.ok) {
        return stable;
      }

      const sanitized = sanitizeToolOutput(stable.data);
      const capped = capToolOutputBytes(sanitized, { maxBytes: 16 * 1024 });
      return {
        ok: true,
        data: capped.value,
        meta: {
          request_id: stable.meta.request_id || requestId,
          ...(capped.truncated ? { truncated: true, max_bytes: capped.maxBytes } : {})
        }
      };
    },
    [requestConfirmation]
  );

  useEffect(() => {
    let alive = true;
    if (didRegisterRef.current) return;
    if (!enabled) return;
    if (!supported) return;

    const pathname = router.pathname || "";
    if (!shouldRegisterOnRoute(pathname)) return;

    const registerable = WEBMCP_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputJsonSchema,
      execute: async (toolArgs: any) => {
        const result = await executeTool(t.name, toolArgs || {});
        return result;
      }
    }));

    function applySuccess(result: { registered: number; errors: number }) {
      didRegisterRef.current = true;
      if (!alive) return;
      dispatchRegistration({
        type: "register/success",
        registeredCount: result.registered,
        errorCount: result.errors,
        // Registration might partially fail depending on API shape; keep the full attempted list for visibility.
        toolNames: registerable.map((tool) => tool.name)
      });
    }

    function applyFailure(error: any) {
      if (!alive) return;
      dispatchRegistration({ type: "register/failure", message: error?.message || "Tool registration failed" });
    }

    try {
      const result = registerTools(registerable);
      applySuccess(result);
    } catch (error: any) {
      applyFailure(error);
    }

    return () => {
      alive = false;
    };
  }, [router.pathname, enabled, supported, executeTool]);

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
