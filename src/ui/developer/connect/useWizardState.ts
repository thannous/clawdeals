import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "../api";
import { clearStoredApiKey, clearStoredLastEventId, getStoredApiKey, setStoredApiKey } from "../storage";
import type { AgentMeResponse, ConnectionMethod, ConnectSessionData, WizardStep } from "./types";

const AUTO_VERIFY_TIMEOUT_MS = 8000;
const OWNER_SESSION_RECONCILE_INTERVAL_MS = 5000;
const DEBUG_PREFIX = "[start.wizard]";
const TERMINAL_AUTO_CLAIM_ERROR_CODES = new Set(["AGENT_ALREADY_CLAIMED"]);

type OwnerSessionProbe = {
  hasSession: boolean;
  ownerId: string | null;
};

function debugLog(event: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  if (payload) {
    console.info(DEBUG_PREFIX, event, payload);
    return;
  }
  console.info(DEBUG_PREFIX, event);
}

async function probeOwnerSession(): Promise<OwnerSessionProbe> {
  try {
    const resp = await fetch("/api/v1/auth/me", {
      method: "GET",
      cache: "no-store"
    });
    if (resp.status === 401) {
      return { hasSession: false, ownerId: null };
    }
    if (!resp.ok) {
      debugLog("owner_session_probe_non_401_preserve_local_state", { status: resp.status });
      // Only explicit unauthenticated responses should clear local connect state.
      return { hasSession: true, ownerId: null };
    }
    const body = await resp.json().catch(() => null);
    const ownerId = body?.data?.owner_id ? String(body.data.owner_id) : null;
    return { hasSession: true, ownerId };
  } catch {
    // Keep local state on transient network failures.
    return { hasSession: true, ownerId: null };
  }
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
  const [ownerSessionResolved, setOwnerSessionResolved] = useState(false);

  const mountedRef = useRef(true);
  const claimInFlightRef = useRef(false);
  const terminalAutoClaimFailuresRef = useRef<Set<string>>(new Set());

  const tryAutoClaim = useCallback(
    async ({
      key,
      ownerId,
      me,
      source
    }: {
      key: string;
      ownerId: string | null;
      me: AgentMeResponse;
      source: "hydrate" | "reconcile";
    }) => {
      if (!ownerId || !me?.agent_id) return me;
      if (me.owner_id === ownerId) return me;
      if (claimInFlightRef.current) return me;
      const claimTargetKey = `${ownerId}:${me.agent_id}`;
      if (terminalAutoClaimFailuresRef.current.has(claimTargetKey)) {
        debugLog(`${source}:auto_claim_skipped_terminal_failure`, {
          agent_id: me.agent_id,
          target_owner_id: ownerId
        });
        return me;
      }

      claimInFlightRef.current = true;
      debugLog(`${source}:auto_claim_start`, {
        agent_id: me.agent_id,
        current_owner_id: me.owner_id || null,
        target_owner_id: ownerId
      });

      try {
        await apiRequest({
          path: "/v1/agents/me/claim",
          method: "POST",
          apiKey: key,
          body: {}
        });
        const claimed = await apiRequest<{ data: AgentMeResponse }>({
          path: "/v1/agents/me",
          method: "GET",
          apiKey: key
        });
        const claimedData = claimed.data?.data;
        if (claimedData?.agent_id) {
          terminalAutoClaimFailuresRef.current.delete(claimTargetKey);
          debugLog(`${source}:auto_claim_success`, {
            agent_id: claimedData.agent_id,
            owner_id: claimedData.owner_id || null
          });
          return claimedData;
        }
      } catch (claimErr: any) {
        const code = String(claimErr?.code || "");
        if (TERMINAL_AUTO_CLAIM_ERROR_CODES.has(code)) {
          terminalAutoClaimFailuresRef.current.add(claimTargetKey);
          debugLog(`${source}:auto_claim_terminal_failure`, {
            message: String(claimErr?.message || "unknown_error"),
            code,
            status: claimErr?.status || null,
            agent_id: me.agent_id,
            target_owner_id: ownerId
          });
          return me;
        }
        debugLog(`${source}:auto_claim_failed`, {
          message: String(claimErr?.message || "unknown_error"),
          code,
          status: claimErr?.status || null
        });
      } finally {
        claimInFlightRef.current = false;
      }

      return me;
    },
    []
  );

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

    const hydrate = async () => {
      debugLog("hydrate:start");
      const ownerProbe = await probeOwnerSession();
      const ownerSession = ownerProbe.hasSession;
      if (!cancelled && mountedRef.current) {
        setHasOwnerSession(ownerSession);
        setOwnerSessionResolved(true);
      }
      const stored = getStoredApiKey();
      if (!stored) {
        debugLog("hydrate:no_stored_key");
        return;
      }

      if (!ownerSession) {
        // Anonymous sessions must not auto-restore API keys on refresh.
        clearStoredApiKey();
        clearStoredLastEventId();
        debugLog("hydrate:no_owner_session_clear_local_key");
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
          const resolvedData = await tryAutoClaim({
            key: stored,
            ownerId: ownerProbe.ownerId,
            me: data,
            source: "hydrate"
          });
          debugLog("hydrate:verify_success", { agent_id: resolvedData.agent_id });
          setAgentMe(resolvedData);
          setAgentId(resolvedData.agent_id);
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
  }, [tryAutoClaim]);

  // Reconcile owner session and auto-claim after initial mount (ex: user logs in later).
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    let intervalHandle: ReturnType<typeof setInterval> | null = null;

    const reconcile = async () => {
      const ownerProbe = await probeOwnerSession();
      if (cancelled || !mountedRef.current) return;
      setHasOwnerSession(ownerProbe.hasSession);
      setOwnerSessionResolved(true);

      if (!ownerProbe.ownerId) return;

      let me = agentMe;
      if (!me?.agent_id) {
        try {
          const meResp = await apiRequest<{ data: AgentMeResponse }>({
            path: "/v1/agents/me",
            method: "GET",
            apiKey
          });
          me = meResp.data?.data || null;
          if (me?.agent_id && !cancelled && mountedRef.current) {
            setAgentMe(me);
            setAgentId(me.agent_id);
            setMethod("apikey");
            setVerifiedState(true);
          }
        } catch {
          return;
        }
      }

      if (!me?.agent_id) return;

      const resolved = await tryAutoClaim({
        key: apiKey,
        ownerId: ownerProbe.ownerId,
        me,
        source: "reconcile"
      });

      if (cancelled || !mountedRef.current) return;
      if (resolved.agent_id !== me.agent_id || resolved.owner_id !== me.owner_id || resolved.name !== me.name) {
        setAgentMe(resolved);
        setAgentId(resolved.agent_id);
      }
    };

    if (hasOwnerSession) {
      void reconcile();
      intervalHandle = setInterval(() => {
        void reconcile();
      }, OWNER_SESSION_RECONCILE_INTERVAL_MS);
    } else {
      debugLog("reconcile:interval_disabled_no_owner_session");
    }

    const onWindowFocus = () => {
      void reconcile();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reconcile();
      }
    };

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (intervalHandle) clearInterval(intervalHandle);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [agentMe, apiKey, hasOwnerSession, tryAutoClaim]);

  const step = deriveStep(method, verified);

  const selectMethod = useCallback((m: ConnectionMethod) => {
    setMethod(m);
    setVerifiedState(false);
    setAgentMe(null);
  }, []);

  const setApiKey = useCallback((key: string, newAgentId?: string) => {
    if (hasOwnerSession) {
      setStoredApiKey(key);
    } else if (ownerSessionResolved) {
      clearStoredApiKey();
    }
    setApiKeyState(key);
    if (newAgentId) setAgentId(newAgentId);
  }, [hasOwnerSession, ownerSessionResolved]);

  useEffect(() => {
    if (!ownerSessionResolved) return;
    if (!hasOwnerSession) return;
    if (!apiKey) return;
    setStoredApiKey(apiKey);
  }, [apiKey, hasOwnerSession, ownerSessionResolved]);

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
