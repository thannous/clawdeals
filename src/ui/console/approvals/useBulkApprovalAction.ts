import { useState, useCallback } from "react";
import { trackApprovalAction } from "./telemetry";

interface UseBulkApprovalActionOptions {
  onSuccess?: () => void;
}

export function useBulkApprovalAction({ onSuccess }: UseBulkApprovalActionOptions = {}) {
  const [submitState, setSubmitState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (approvalIds: string[], action: "approve" | "deny", reason?: string) => {
      if (approvalIds.length === 0 || submitState === "loading") return;

      setSubmitState("loading");
      setError(null);

      const idempotencyKey = `bulk-${action}-${Date.now()}`;

      try {
        const bodyPayload: any = { approval_ids: approvalIds, action };
        if (reason) bodyPayload.reason = reason;

        const resp = await fetch("/api/console/approvals/bulk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(bodyPayload),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${resp.status}`);
        }

        setSubmitState("done");
        trackApprovalAction({ action, count: approvalIds.length, bulk: true });
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
