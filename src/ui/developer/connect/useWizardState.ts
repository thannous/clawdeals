import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "../api";
import { clearStoredApiKey, clearStoredLastEventId, getStoredApiKey, setStoredApiKey } from "../storage";
import type { AgentMeResponse, ConnectionMethod, ConnectSessionData, WizardStep } from "./types";

const AUTO_VERIFY_TIMEOUT_MS = 8000;
const DEBUG_PREFIX = "[start.wizard]";

function debugLog(event: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  if (payload) {
    console.info(DEBUG_PREFIX, event, payload);
    return;
  }
  console.info(DEBUG_PREFIX, event);
}

export type WizardState = {
  step: WizardStep;
  method: ConnectionMethod | null;
  apiKey: string | null;
  agentId: string | null;
  claimSession: ConnectSessionData | null;
  agentMe: AgentMeResponse | null;
  verified: boolean;
  autoVerifying: boolean;
  hasOwnerSession: boolean;
};

function deriveStep(method: ConnectionMethod | null, verified: boolean): WizardStep {
  if (verified) return "firstwin";
  if (method !== null) return "verify";
  return "connect";
}

export function useWizardState() {
  const [method, setMethod] = useState<ConnectionMethod | null>(null);
  // Initialize to null for SSR safety; hydrated from localStorage in effect below
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [claimSession, setClaimSession] = useState<ConnectSessionData | null>(null);
  const [agentMe, setAgentMe] = useState<AgentMeResponse | null>(null);
  const [verified, setVerifiedState] = useState(false);
  const [autoVerifying, setAutoVerifying] = useState(false);
  const [hasOwnerSession, setHasOwnerSession] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    debugLog("mount");
    return () => {
      debugLog("unmount");
      mountedRef.current = false;
    };
  }, []);

  // Hydrate stored key from localStorage and auto-verify on mount
  useEffect(() => {
    let cancelled = false;

    const hasOwnerSession = async () => {
      try {
        const resp = await fetch("/api/v1/auth/me", {
          method: "GET",
          cache: "no-store"
        });
        if (resp.status === 401) return false;
        return resp.ok;
      } catch {
        // Keep local state on transient network failures.
        return true;
      }
    };

    const hydrate = async () => {
      debugLog("hydrate:start");
      const ownerSession = await hasOwnerSession();
      if (!cancelled && mountedRef.current) {
        setHasOwnerSession(ownerSession);
      }
      if (!ownerSession) {
        debugLog("hydrate:no_owner_session_clear_local_connect_state");
        clearStoredApiKey();
        clearStoredLastEventId();
        if (cancelled || !mountedRef.current) return;
        setApiKeyState(null);
        setMethod(null);
        setAgentId(null);
        setAgentMe(null);
        setVerifiedState(false);
        return;
      }

      const stored = getStoredApiKey();
      if (!stored) {
        debugLog("hydrate:no_stored_key");
        return;
      }

      // Hydrate the key into state so the UI can show the masked key
      setApiKeyState(stored);
      setAutoVerifying(true);
      debugLog("hydrate:auto_verify_started", { key_present: true, timeout_ms: AUTO_VERIFY_TIMEOUT_MS });

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      try {
        const verifyPromise = apiRequest<{ data: AgentMeResponse }>({
          path: "/v1/agents/me",
          method: "GET",
          apiKey: stored
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error("AUTO_VERIFY_TIMEOUT")), AUTO_VERIFY_TIMEOUT_MS);
        });

        const res = await Promise.race([verifyPromise, timeoutPromise]);
        debugLog("hydrate:verify_resolved");
        if (cancelled || !mountedRef.current) return;
        const data = res.data?.data;
        if (data?.agent_id) {
          debugLog("hydrate:verify_success", { agent_id: data.agent_id });
          setAgentMe(data);
          setAgentId(data.agent_id);
          setMethod("apikey");
          setVerifiedState(true);
        } else {
          debugLog("hydrate:verify_missing_agent_id");
        }
      } catch (error: any) {
        // Key is invalid or expired -- don't clear it, just don't auto-advance
        debugLog("hydrate:verify_failed", { message: String(error?.message || "unknown_error") });
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (!cancelled && mountedRef.current) {
          setAutoVerifying(false);
          debugLog("hydrate:auto_verify_stopped");
        } else {
          debugLog("hydrate:auto_verify_skip_stop", {
            cancelled,
            mounted: mountedRef.current
          });
        }
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const step = deriveStep(method, verified);

  const selectMethod = useCallback((m: ConnectionMethod) => {
    setMethod(m);
    setVerifiedState(false);
    setAgentMe(null);
  }, []);

  const setApiKey = useCallback((key: string, newAgentId?: string) => {
    setStoredApiKey(key);
    setApiKeyState(key);
    if (newAgentId) setAgentId(newAgentId);
  }, []);

  const setVerified = useCallback((me: AgentMeResponse | null) => {
    if (me) setAgentMe(me);
    setVerifiedState(true);
  }, []);

  const reset = useCallback(() => {
    clearStoredApiKey();
    setApiKeyState(null);
    setAgentId(null);
    setMethod(null);
    setClaimSession(null);
    setAgentMe(null);
    setVerifiedState(false);
  }, []);

  return {
    state: {
      step,
      method,
      apiKey,
      agentId,
      claimSession,
      agentMe,
      verified,
      autoVerifying,
      hasOwnerSession
    } as WizardState,
    selectMethod,
    setApiKey,
    setClaimSession,
    setVerified,
    reset
  };
}
