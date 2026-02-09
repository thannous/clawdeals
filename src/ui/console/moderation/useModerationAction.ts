import { useState, useCallback } from "react";
import { trackModerationAction } from "./telemetry";

type ModerationActionType = "hide" | "unhide" | "suspend" | "unsuspend" | "revoke-key";

interface UseModerationActionOptions {
  onSuccess?: () => void;
}

export function useModerationAction({ onSuccess }: UseModerationActionOptions = {}) {
  const [submitState, setSubmitState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (actionType: ModerationActionType, body: Record<string, unknown>) => {
      if (submitState === "loading") return;

      setSubmitState("loading");
      setError(null);

      try {
        const resp = await fetch(`/api/console/moderation/${actionType}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data?.error?.message || `HTTP ${resp.status}`);
        }

        setSubmitState("done");
        trackModerationAction({ actionType });
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
