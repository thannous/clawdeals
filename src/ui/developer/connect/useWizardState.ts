import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "../api";
import { clearStoredApiKey, getStoredApiKey, setStoredApiKey } from "../storage";
import type { AgentMeResponse, ConnectionMethod, ConnectSessionData, WizardStep } from "./types";

export type WizardState = {
  step: WizardStep;
  method: ConnectionMethod | null;
  apiKey: string | null;
  agentId: string | null;
  claimSession: ConnectSessionData | null;
  agentMe: AgentMeResponse | null;
  verified: boolean;
  autoVerifying: boolean;
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

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Hydrate stored key from localStorage and auto-verify on mount
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const stored = getStoredApiKey();
      if (!stored) return;

      // Hydrate the key into state so the UI can show the masked key
      setApiKeyState(stored);
      setAutoVerifying(true);

      try {
        const res = await apiRequest<{ data: AgentMeResponse }>({
          path: "/v1/agents/me",
          method: "GET",
          apiKey: stored
        });
        if (cancelled || !mountedRef.current) return;
        const data = res.data?.data;
        if (data?.agent_id) {
          setAgentMe(data);
          setAgentId(data.agent_id);
          setMethod("apikey");
          setVerifiedState(true);
        }
      } catch {
        // Key is invalid or expired -- don't clear it, just don't auto-advance
      } finally {
        if (!cancelled && mountedRef.current) {
          setAutoVerifying(false);
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
      autoVerifying
    } as WizardState,
    selectMethod,
    setApiKey,
    setClaimSession,
    setVerified,
    reset
  };
}
