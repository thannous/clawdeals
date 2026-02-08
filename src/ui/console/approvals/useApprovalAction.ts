import { useState, useCallback } from "react";
import { trackApprovalAction } from "./telemetry";

interface UseApprovalActionOptions {
  approvalId: string | undefined;
  onSuccess?: () => void;
}

export function useApprovalAction({ approvalId, onSuccess }: UseApprovalActionOptions) {
  const [submitState, setSubmitState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (action: "approve" | "deny") => {
      if (!approvalId || submitState === "loading") return;

      setSubmitState("loading");
      setError(null);

      const idempotencyKey = `${approvalId}-${action}-${Date.now()}`;

      try {
        const resp = await fetch(`/api/console/approvals/${approvalId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ action }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${resp.status}`);
        }

        setSubmitState("done");
        trackApprovalAction({ approvalId, action });
        onSuccess?.();
      } catch (err: any) {
        setError(err.message);
        setSubmitState("error");
      }
    },
    [approvalId, submitState, onSuccess]
  );

  return { execute, submitState, error };
}
