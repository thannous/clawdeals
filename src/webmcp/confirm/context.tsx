import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import type { ConfirmDecision, ConfirmHistoryEntry, ConfirmRequest } from "./types";
import { randomUuid } from "../utils";

type PendingState = {
  request: ConfirmRequest;
  resolve: (decision: ConfirmDecision) => void;
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushHistory = useCallback((entry: ConfirmHistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev];
      return next.slice(0, 20);
    });
  }, []);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const decide = useCallback(
    (decision: ConfirmDecision) => {
      if (!pending) return;
      clearTimer();

      pushHistory({
        requestId: pending.request.requestId,
        toolName: pending.request.toolName,
        toolScope: pending.request.toolScope,
        decidedAt: new Date().toISOString(),
        decision: decision.kind === "approve" ? "APPROVED" : "DENIED",
        reason: decision.kind === "approve" ? null : decision.reason
      });

      pending.resolve(decision);
      setPending(null);
    },
    [pending, clearTimer, pushHistory]
  );

  const requestConfirmation = useCallback(
    async (req: Omit<ConfirmRequest, "requestId"> & { requestId?: string }): Promise<ConfirmDecision> => {
      const now = Date.now();
      const requestId = req.requestId || randomUuid();

      // Cooldown: block noisy agents.
      if (cooldownUntilMs && now < cooldownUntilMs) {
        return { kind: "deny", code: "USER_DENIED", reason: "cooldown" };
      }

      // If another confirmation is already pending, fail closed.
      if (pending) {
        return { kind: "deny", code: "USER_DENIED", reason: "another_confirmation_pending" };
      }

      // Anti-spam: > 10 requests in 30s triggers cooldown.
      const windowMs = 30_000;
      const timestamps = recentRequestsRef.current.filter((t) => now - t <= windowMs);
      timestamps.push(now);
      recentRequestsRef.current = timestamps;
      if (timestamps.length > 10) {
        setCooldownUntilMs(now + windowMs);
        return { kind: "deny", code: "USER_DENIED", reason: "cooldown" };
      }

      const request: ConfirmRequest = {
        ...req,
        requestId,
        timeoutMs: typeof req.timeoutMs === "number" && Number.isFinite(req.timeoutMs) ? req.timeoutMs : 60_000
      };

      return new Promise<ConfirmDecision>((resolve) => {
        clearTimer();

        timeoutRef.current = setTimeout(() => {
          setPending(null);
          pushHistory({
            requestId,
            toolName: request.toolName,
            toolScope: request.toolScope,
            decidedAt: new Date().toISOString(),
            decision: "DENIED",
            reason: "timeout"
          });
          resolve({ kind: "deny", code: "USER_DENIED", reason: "timeout" });
        }, request.timeoutMs);

        setPending({ request, resolve });
      });
    },
    [pending, clearTimer, pushHistory, cooldownUntilMs]
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

