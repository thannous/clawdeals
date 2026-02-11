import { useRouter } from "next/router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

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

  const [registered, setRegistered] = useState(false);
  const [registeredToolNames, setRegisteredToolNames] = useState<string[]>([]);
  const [lastRegisterError, setLastRegisterError] = useState<string | null>(null);

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
        idempotencyKey: tool.scope === "read" ? null : null
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

    try {
      const result = registerTools(registerable);
      didRegisterRef.current = true;

      // Avoid synchronous setState within an effect body (react-hooks/set-state-in-effect).
      Promise.resolve().then(() => {
        if (!alive) return;
        setRegistered(result.registered > 0);
        // WebMCP registration might partially fail depending on API shape; keep the full list for visibility.
        setRegisteredToolNames(registerable.map((t) => t.name));
        if (result.errors > 0) {
          setLastRegisterError(`${result.errors} tool(s) failed to register`);
        }
      });
    } catch (error: any) {
      Promise.resolve().then(() => {
        if (!alive) return;
        setLastRegisterError(error?.message || "Tool registration failed");
      });
    }

    return () => {
      alive = false;
    };
  }, [router.pathname, enabled, supported, executeTool]);

  const value = useMemo<WebMcpContextValue>(
    () => ({
      enabled,
      supported,
      registered,
      registeredToolNames,
      lastRegisterError,
      executeTool
    }),
    [enabled, supported, registered, registeredToolNames, lastRegisterError, executeTool]
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
