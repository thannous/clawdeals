import { useState, useCallback } from "react";

interface UseMyApprovalActionOptions {
  onSuccess?: () => void;
}

type ApprovalActionInput = {
  note?: string;
  amount?: number;
};

export function useMyApprovalAction({ onSuccess }: UseMyApprovalActionOptions = {}) {
  const [submitState, setSubmitState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (
      approvalId: string,
      action: "approve" | "deny" | "revoke",
      input: ApprovalActionInput = {}
    ) => {
      if (!approvalId || submitState === "loading") return;

      setSubmitState("loading");
      setError(null);

      const idempotencyKey = `${approvalId}-${action}-${Date.now()}`;

      try {
        const bodyPayload: any = {};
        if (input.note) bodyPayload.note = input.note;
        if (input.amount !== undefined) bodyPayload.amount = input.amount;

        const resp = await fetch(`/api/v1/approvals/${approvalId}:${action}`, {
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
        onSuccess?.();
      } catch (err: any) {
        setError(err.message);
        setSubmitState("error");
      }
    },
    [submitState, onSuccess]
  );

  const reset = useCallback(() => {
    setSubmitState("idle");
    setError(null);
  }, []);

  return { execute, submitState, error, reset };
}
