import { useCallback, useState } from "react";

function randomIdempotencyKey(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function getErrorMessage(body: any, status: number): string {
  const message =
    body?.error?.message ||
    body?.error?.msg ||
    body?.message ||
    (typeof body?.error === "string" ? body.error : null) ||
    `HTTP ${status}`;
  return String(message || `HTTP ${status}`);
}

export function useTelegramPairStart() {
  const [startState, setStartState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (startState === "loading") return { ok: false, error: "Already starting" };

    setStartState("loading");
    setError(null);

    const idempotencyKey = randomIdempotencyKey();

    try {
      const resp = await fetch("/api/console/channels/telegram/pair:start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({}),
      });

      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const message = getErrorMessage(body, resp.status);
        setError(message);
        setStartState("error");
        return { ok: false, status: resp.status, error: message };
      }

      const telegram_deeplink =
        body?.telegram_deeplink || body?.telegramDeeplink || body?.data?.telegram_deeplink || null;
      if (!telegram_deeplink) {
        const message = "Unexpected response: missing telegram_deeplink";
        setError(message);
        setStartState("error");
        return { ok: false, status: resp.status, error: message };
      }

      setStartState("done");
      return { ok: true, telegram_deeplink: String(telegram_deeplink) };
    } catch (err: any) {
      const message = String(err?.message || "Request failed");
      setError(message);
      setStartState("error");
      return { ok: false, error: message };
    }
  }, [startState]);

  return { start, startState, error };
}

