import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest, buildApiUrl } from "../api";
import type { ConnectSessionData, ExchangeResult, PollStatus } from "./types";

function randomIdempotencyKey(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export function useConnectSession() {
  const [pollStatus, setPollStatus] = useState<PollStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [claimedData, setClaimedData] = useState<{ session_id: string; status: string; claimed_at: string | null } | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const createSession = useCallback(async (
    agentName?: string,
    acquisitionId?: string | null
  ): Promise<ConnectSessionData> => {
    setIsCreating(true);
    setError(null);
    setPollStatus("idle");
    setClaimedData(null);

    try {
      const result = await apiRequest<{ data: ConnectSessionData }>({
        path: "/v1/connect/sessions",
        method: "POST",
        idempotencyKey: randomIdempotencyKey(),
        body: {
          requested_agent_name: agentName || "Clawdeals Agent",
          requested_scopes: ["agent:read", "agent:write"],
          acquisition_id: acquisitionId || undefined
        }
      });

      const session = result.data?.data;
      if (!session?.session_id || !session.poll_token) {
        throw new Error("Unexpected response from server.");
      }

      return session;
    } finally {
      if (mountedRef.current) setIsCreating(false);
    }
  }, []);

  const startPolling = useCallback((session: ConnectSessionData) => {
    stopPolling();
    setPollStatus("polling");
    setError(null);
    setClaimedData(null);
    pollCountRef.current = 0;
    startTimeRef.current = Date.now();

    function schedulePoll(delayMs: number) {
      pollTimerRef.current = setTimeout(() => poll(session), delayMs);
    }

    async function poll(s: ConnectSessionData) {
      if (!mountedRef.current) return;

      if (Date.now() - startTimeRef.current > MAX_POLL_DURATION_MS) {
        setPollStatus("expired");
        setError("Session timed out. Please try again.");
        return;
      }

      abortRef.current = new AbortController();

      try {
        const url = buildApiUrl(`/v1/connect/sessions/${s.session_id}`);
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${s.poll_token}` },
          signal: abortRef.current.signal
        });

        if (!mountedRef.current) return;

        if (resp.status === 429) {
          const retryAfter = parseInt(resp.headers.get("Retry-After") || "5", 10);
          schedulePoll(retryAfter * 1000);
          return;
        }

        const json = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          throw new Error(json?.error?.message || `Poll failed (${resp.status})`);
        }

        const status = json?.data?.status;

        if (status === "PENDING_CLAIM") {
          pollCountRef.current++;
          schedulePoll(s.interval_seconds * 1000);
          return;
        }

        if (status === "CLAIMED" || status === "DELIVERED") {
          setPollStatus("claimed");
          setClaimedData(json.data);
          return;
        }

        if (status === "EXPIRED") {
          setPollStatus("expired");
          setError("Session expired. Please generate a new link.");
          return;
        }

        if (status === "CANCELLED") {
          setPollStatus("error");
          setError("Connection was refused by the owner.");
          return;
        }

        // Unknown status -- keep polling
        pollCountRef.current++;
        schedulePoll(s.interval_seconds * 1000);
      } catch (err: any) {
        if (!mountedRef.current) return;
        if (err.name === "AbortError") return;

        // Exponential backoff on network errors
        const backoff = Math.min(
          30000,
          s.interval_seconds * 1000 * Math.pow(2, Math.min(pollCountRef.current, 5))
        );
        pollCountRef.current++;
        schedulePoll(backoff);
      }
    }

    schedulePoll(session.interval_seconds * 1000);
  }, [stopPolling]);

  const exchangeForApiKey = useCallback(async (session: ConnectSessionData): Promise<ExchangeResult> => {
    const url = buildApiUrl(`/v1/connect/sessions/${session.session_id}/exchange`);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.poll_token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": randomIdempotencyKey()
      },
      body: JSON.stringify({
        requested_key_scope: "agent_write",
        installation: {
          client_type: "web_browser",
          client_version: "1.0"
        }
      })
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(json?.error?.message || `Exchange failed (${resp.status})`);
    }

    const data = json?.data;
    if (!data?.api_key || !data?.agent_id) {
      throw new Error("Exchange succeeded but no API key was returned.");
    }

    return data as ExchangeResult;
  }, []);

  const resetSession = useCallback(() => {
    stopPolling();
    setPollStatus("idle");
    setError(null);
    setClaimedData(null);
    setIsCreating(false);
  }, [stopPolling]);

  return {
    createSession,
    startPolling,
    stopPolling,
    exchangeForApiKey,
    resetSession,
    pollStatus,
    claimedData,
    error,
    isCreating
  };
}
