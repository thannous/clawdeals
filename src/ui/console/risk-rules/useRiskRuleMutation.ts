import { useCallback, useState } from "react";

export function useRiskRuleMutation({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [submitState, setSubmitState] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (ruleId: string, patch: Record<string, any>) => {
      setSubmitState("loading");
      setError(null);
      try {
        const response = await fetch(`/api/console/risk-rules/${encodeURIComponent(ruleId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${response.status}`);
        }
        onSuccess?.();
        return await response.json();
      } catch (err: any) {
        setError(err?.message || "Failed to update risk rule");
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
    execute
  };
}

