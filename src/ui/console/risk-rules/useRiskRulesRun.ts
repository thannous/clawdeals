import { useCallback, useState } from "react";

export function useRiskRulesRun() {
  const [submitState, setSubmitState] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const execute = useCallback(async (input: { dry_run?: boolean; rule_key?: string | null; max_agents_per_rule?: number | null }) => {
    setSubmitState("loading");
    setError(null);
    try {
      const response = await fetch("/api/console/risk-rules/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input || {})
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${response.status}`);
      }
      const body = await response.json();
      setResult(body);
      return body;
    } catch (err: any) {
      setError(err?.message || "Failed to run risk rules");
      throw err;
    } finally {
      setSubmitState("idle");
    }
  }, []);

  return {
    submitState,
    error,
    result,
    execute
  };
}

