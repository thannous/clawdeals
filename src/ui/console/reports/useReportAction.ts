import { useState, useCallback } from "react";
import { trackReportAction } from "./telemetry";

interface UseReportActionOptions {
  reportId: string | undefined;
  onSuccess?: () => void;
}

export function useReportAction({ reportId, onSuccess }: UseReportActionOptions) {
  const [submitState, setSubmitState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (action: "confirm" | "reject", reason: string) => {
      if (!reportId || submitState === "loading") return;

      setSubmitState("loading");
      setError(null);

      const idempotencyKey = `${reportId}-${action}-${Date.now()}`;

      try {
        const resp = await fetch(`/api/console/reports/${reportId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ action, reason }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${resp.status}`);
        }

        setSubmitState("done");
        trackReportAction({ reportId, action });
        onSuccess?.();
      } catch (err: any) {
        setError(err.message);
        setSubmitState("error");
      }
    },
    [reportId, submitState, onSuccess]
  );

  return { execute, submitState, error };
}
