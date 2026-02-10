import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/router";

function randomIdempotencyKey(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0] || "";
  if (typeof value === "string") return value;
  return "";
}

function getErrorMessage(body: any, status: number): string {
  const code = body?.error?.code || null;

  if (code === "PAIR_TOKEN_EXPIRED") {
    return "Pair token expired. Go back to Telegram and run /connect to get a new link.";
  }
  if (code === "PAIR_TOKEN_USED") {
    return "Pair token already used. Go back to Telegram and run /connect to get a new link.";
  }
  if (code === "PAIR_TOKEN_INVALID") {
    return "Invalid pair token. Go back to Telegram and run /connect to get a new link.";
  }
  if (code === "CHANNEL_ALREADY_PAIRED") {
    return "This Telegram account is already paired to another owner.";
  }

  return body?.error?.message || body?.message || `HTTP ${status}`;
}

export default function PairPage() {
  const router = useRouter();
  const token = useMemo(() => resolveQueryParam(router.query?.token).trim(), [router.query?.token]);

  const [submitState, setSubmitState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultState, setResultState] = useState<string | null>(null);

  const onConfirm = useCallback(async () => {
    if (submitState === "loading") return;
    if (!token) {
      setError("Missing token. Go back to Telegram and run /connect to get a new link.");
      setSubmitState("error");
      return;
    }

    setSubmitState("loading");
    setError(null);

    const idempotencyKey = randomIdempotencyKey();

    try {
      const resp = await fetch("/api/console/channels/telegram/pair:confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify({ pair_token: token })
      });

      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const message = getErrorMessage(body, resp.status);
        setError(message);
        setSubmitState("error");
        return;
      }

      const state = body?.data?.state || body?.state || null;
      setResultState(state ? String(state) : null);
      setSubmitState("done");
    } catch (err: any) {
      setError(String(err?.message || "Request failed"));
      setSubmitState("error");
    }
  }, [submitState, token]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-surface border border-border rounded clip-corner p-5 space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>PAIR
          </h1>
          <p className="text-xs font-mono text-subtle">
            Confirm the association between Telegram and your Clawdeals owner account.
          </p>
        </div>

        {!token && (
          <div className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-red-400">Missing token</div>
            <div className="text-xs font-mono text-muted mt-1">
              Go back to Telegram and run <span className="text-text">/connect</span> to get a new link.
            </div>
          </div>
        )}

        {token && (
          <div className="text-[10px] font-mono text-muted break-all">
            token=<span className="text-text">{token}</span>
          </div>
        )}

        {error && (
          <div className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-red-400">Error</div>
            <div className="text-xs font-mono text-muted mt-1">{error}</div>
          </div>
        )}

        {submitState === "done" && (
          <div className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-secondary">Success</div>
            <div className="text-xs font-mono text-muted mt-1">
              {resultState === "PAIRED"
                ? "Paired. You should receive a confirmation in Telegram."
                : resultState === "PENDING_APPROVAL"
                  ? "Pairing is pending approval. Approve it in the console approvals queue."
                  : "Pairing confirmed."}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={!token || submitState === "loading"}
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {submitState === "loading" ? "Confirming..." : "Confirm Pairing"}
          </button>

          <button
            onClick={() => router.push("/console/channels")}
            className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
          >
            Console Channels
          </button>

          <button
            onClick={() => router.push("/console/approvals")}
            className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
          >
            Console Approvals
          </button>
        </div>

        <div className="text-[10px] font-mono text-subtle">
          Tip: in Telegram, send <span className="text-text">/connect</span> anytime to generate a new pairing link.
        </div>
      </div>
    </div>
  );
}

