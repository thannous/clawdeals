import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { ConfirmDecision, ConfirmHistoryEntry, ConfirmRequest } from "./types";
import { randomUuid } from "../utils";

type PendingState = {
  request: ConfirmRequest;
  resolve: (decision: ConfirmDecision) => void;
  timer: ReturnType<typeof setTimeout> | null;
  removeAbortListener: (() => void) | null;
};

type ConfirmContextValue = {
  pending: ConfirmRequest | null;
  history: ConfirmHistoryEntry[];
  cooldownUntilMs: number | null;
  requestConfirmation: (req: Omit<ConfirmRequest, "requestId"> & { requestId?: string }) => Promise<ConfirmDecision>;
  decide: (decision: ConfirmDecision) => void;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useWebMcpConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useWebMcpConfirm must be used within WebMcpConfirmProvider");
  }
  return ctx;
}

export function WebMcpConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);
  const [history, setHistory] = useState<ConfirmHistoryEntry[]>([]);
  const [cooldownUntilMs, setCooldownUntilMs] = useState<number | null>(null);

  const recentRequestsRef = useRef<number[]>([]);
  const pendingRef = useRef<PendingState | null>(null);
  const mountedRef = useRef(true);

  const pushHistory = useCallback((entry: ConfirmHistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev];
      return next.slice(0, 20);
    });
  }, []);

  const settle = useCallback(
    (owner: PendingState, decision: ConfirmDecision) => {
      // A stale modal, timeout, or cancellation must never decide a newer request.
      if (pendingRef.current !== owner) return;
      pendingRef.current = null;
      if (owner.timer !== null) clearTimeout(owner.timer);
      owner.removeAbortListener?.();

      if (mountedRef.current) {
        setPending(null);
        pushHistory({
          requestId: owner.request.requestId,
          toolName: owner.request.toolName,
          toolScope: owner.request.toolScope,
          decidedAt: new Date().toISOString(),
          decision: decision.kind === "approve" ? "APPROVED" : "DENIED",
          reason: decision.kind === "approve" ? null : decision.reason
        });
      }
      owner.resolve(decision);
    },
    [pushHistory]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const owner = pendingRef.current;
      if (owner) settle(owner, { kind: "deny", code: "USER_DENIED", reason: "provider_unmounted" });
    };
  }, [settle]);

  const decide = useCallback(
    (decision: ConfirmDecision) => {
      // Keep the decision bound to the request actually rendered to the user.
      if (pending) settle(pending, decision);
    },
    [pending, settle]
  );

  const requestConfirmation = useCallback(
    async (req: Omit<ConfirmRequest, "requestId"> & { requestId?: string }): Promise<ConfirmDecision> => {
      if (!mountedRef.current) {
        return { kind: "deny", code: "USER_DENIED", reason: "provider_unmounted" };
      }
      if (req.signal?.aborted) {
        return { kind: "deny", code: "USER_DENIED", reason: "aborted" };
      }
      const now = Date.now();
      const requestId = req.requestId || randomUuid();

      // Cooldown: block noisy agents.
      if (cooldownUntilMs && now < cooldownUntilMs) {
        return { kind: "deny", code: "USER_DENIED", reason: "cooldown" };
      }

      // If another confirmation is already pending, fail closed.
      if (pendingRef.current) {
        return { kind: "deny", code: "USER_DENIED", reason: "another_confirmation_pending" };
      }

      // Anti-spam: > 10 requests in 30s triggers cooldown.
      const windowMs = 30_000;
      const timestamps = recentRequestsRef.current.filter((t) => now - t <= windowMs);
      timestamps.push(now);
      recentRequestsRef.current = timestamps;
      if (timestamps.length > 10) {
        setCooldownUntilMs((prev) => {
          const next = now + windowMs;
          return prev && prev > next ? prev : next;
        });
        return { kind: "deny", code: "USER_DENIED", reason: "cooldown" };
      }

      const request: ConfirmRequest = {
        ...req,
        requestId,
        timeoutMs: typeof req.timeoutMs === "number" && Number.isFinite(req.timeoutMs) ? req.timeoutMs : 60_000
      };

      return new Promise<ConfirmDecision>((resolve) => {
        const owner: PendingState = { request, resolve, timer: null, removeAbortListener: null };
        // Reserve before React commits state so concurrent callers fail closed.
        pendingRef.current = owner;
        owner.timer = setTimeout(() => {
          settle(owner, { kind: "deny", code: "USER_DENIED", reason: "timeout" });
        }, request.timeoutMs);
        if (req.signal) {
          const signal = req.signal;
          const onAbort = () => settle(owner, { kind: "deny", code: "USER_DENIED", reason: "aborted" });
          signal.addEventListener("abort", onAbort, { once: true });
          owner.removeAbortListener = () => signal.removeEventListener("abort", onAbort);
        }
        setPending(owner);
      });
    },
    [settle, cooldownUntilMs]
  );

  const value = useMemo<ConfirmContextValue>(
    () => ({
      pending: pending?.request || null,
      history,
      cooldownUntilMs,
      requestConfirmation,
      decide
    }),
    [pending, history, cooldownUntilMs, requestConfirmation, decide]
  );

  return <ConfirmContext.Provider value={value}>{children}</ConfirmContext.Provider>;
}
