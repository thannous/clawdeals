import { useState, useCallback } from "react";

type Action = "approve" | "deny" | "revoke";

export function useChannelIdentityAction({ onSuccess }: any = {}) {
  const [submitState, setSubmitState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async ({ channelIdentityId, action, role }: { channelIdentityId: string; action: Action; role?: string }) => {
      if (!channelIdentityId || submitState === "loading") return;

      setSubmitState("loading");
      setError(null);

      const idempotencyKey = `${channelIdentityId}-${action}-${Date.now()}`;

      try {
        const resp = await fetch(`/api/console/channels/${channelIdentityId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ action, role }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${resp.status}`);
        }

        const data = await resp.json().catch(() => ({}));
        setSubmitState("done");
        onSuccess?.(data.identity);
      } catch (err: any) {
        setError(err.message);
        setSubmitState("error");
      }
    },
    [submitState, onSuccess]
  );

  return { execute, submitState, error };
}

