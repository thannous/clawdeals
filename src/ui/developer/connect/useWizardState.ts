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
  const [apiKey, setApiKeyState] = useState<string | null>(() => getStoredApiKey());
  const [agentId, setAgentId] = useState<string | null>(null);
  const [claimSession, setClaimSession] = useState<ConnectSessionData | null>(null);
  const [agentMe, setAgentMe] = useState<AgentMeResponse | null>(null);
  const [verified, setVerifiedState] = useState(false);
  const [autoVerifying, setAutoVerifying] = useState(() => Boolean(getStoredApiKey()));

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Auto-verify on mount if we have a stored key
  useEffect(() => {
    const stored = getStoredApiKey();
    if (!stored) return;

    let cancelled = false;

    apiRequest<{ data: AgentMeResponse }>({
      path: "/v1/agents/me",
      method: "GET",
      apiKey: stored
    })
      .then((res) => {
        if (cancelled || !mountedRef.current) return;
        const data = res.data?.data;
        if (data?.agent_id) {
          setAgentMe(data);
          setAgentId(data.agent_id);
          setMethod("apikey");
          setVerifiedState(true);
        }
      })
      .catch(() => {
        // Key is invalid or expired -- don't clear it, just don't auto-advance
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) {
          setAutoVerifying(false);
        }
      });

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
