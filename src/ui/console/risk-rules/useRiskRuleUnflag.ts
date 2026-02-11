import { useCallback, useState } from "react";

type UnflagPayload = {
  agent_id: string;
  flag: string;
  reason: string;
};

export function useRiskRuleUnflag({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [submitState, setSubmitState] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  const execute = useCallback(
    async (payload: UnflagPayload) => {
      setSubmitState("loading");
      setError(null);
      try {
        const response = await fetch("/api/console/risk-rules/unflag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${response.status}`);
        }
        const body = await response.json();
        setLastResult(body);
        onSuccess?.();
        return body;
      } catch (err: any) {
        setError(err?.message || "Failed to remove flag");
        throw err;
      } finally {
        setSubmitState("idle");
      }
    },
    [onSuccess]
  );

  return {
    submitState,
    error,
    lastResult,
    execute
  };
}

