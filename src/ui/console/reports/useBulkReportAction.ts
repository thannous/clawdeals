import { useState, useCallback } from "react";
import { trackReportBulkAction } from "./telemetry";

interface UseBulkReportActionOptions {
  onSuccess?: () => void;
}

export function useBulkReportAction({ onSuccess }: UseBulkReportActionOptions) {
  const [submitState, setSubmitState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (reportIds: string[], action: "confirm" | "reject", reason: string) => {
      if (reportIds.length === 0 || submitState === "loading") return;

      setSubmitState("loading");
      setError(null);

      const idempotencyKey = `bulk-${action}-${Date.now()}`;

      try {
        const resp = await fetch("/api/console/reports/bulk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ report_ids: reportIds, action, reason }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${resp.status}`);
        }

        setSubmitState("done");
        trackReportBulkAction({ reportIds, action, count: reportIds.length });
        onSuccess?.();
      } catch (err: any) {
        setError(err.message);
        setSubmitState("error");
      }
    },
    [submitState, onSuccess]
  );

  return { execute, submitState, error };
}
