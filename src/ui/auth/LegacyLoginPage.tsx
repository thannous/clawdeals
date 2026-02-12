import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import {
  clearStoredOwnerAuth,
  getStoredOwnerEmail,
  getStoredOwnerSessionId,
  getStoredOwnerSessionToken,
  setStoredOwnerEmail,
  setStoredOwnerSessionId,
  setStoredOwnerSessionToken
} from "./ownerAuth";

function getErrorMessage(body: any, status: number) {
  const error = body?.error;
  if (error?.message) return String(error.message);
  if (body?.message) return String(body.message);
  return `HTTP ${status}`;
}

const EXPIRES_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function formatExpiresAt(expiresAt: string) {
  const d = new Date(expiresAt);
  if (!Number.isFinite(d.getTime())) return expiresAt;
  return EXPIRES_FORMATTER.format(d);
}

export default function LegacyLoginPage() {
  const [email, setEmail] = useState(() => getStoredOwnerEmail() || "");
  const [sessionId, setSessionId] = useState<string | null>(() => getStoredOwnerSessionId());
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredOwnerSessionToken());
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim().length > 0 && submitState !== "loading", [email, submitState]);

  const resetAuth = useCallback(() => {
    void fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    clearStoredOwnerAuth();
    setSessionId(null);
    setToken(null);
    setExpiresAt(null);
    setSubmitState("idle");
    setError(null);
  }, []);

  const onSend = useCallback(async () => {
    if (!email.trim()) {
      setError("Enter an email address.");
      setSubmitState("error");
      return;
    }

    setSubmitState("loading");
    setError(null);
    setToken(null);
    setExpiresAt(null);

    setStoredOwnerEmail(email.trim());

    try {
      const res = await fetch("/api/v1/auth/login:start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: email.trim() })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getErrorMessage(body, res.status));
      }

      const nextSessionId = body?.data?.session_id ? String(body.data.session_id) : null;
      const nextToken = body?.data?.session_token ? String(body.data.session_token) : null;
      const nextExpires = body?.data?.expires_at ? String(body.data.expires_at) : null;

      if (!nextSessionId) {
        throw new Error("Missing session_id in response");
      }

      setStoredOwnerSessionId(nextSessionId);
      setSessionId(nextSessionId);
      if (nextToken) {
        setStoredOwnerSessionToken(nextToken);
      }

      setToken(nextToken);
      setExpiresAt(nextExpires);
      setSubmitState("sent");
    } catch (err: any) {
      setError(String(err?.message || "Failed to send login link"));
      setSubmitState("error");
    }
  }, [email]);

  return (
    <div data-testid="auth-login-page" className="min-h-screen bg-bg relative overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-60" />
      <div className="animate-scanline" />

      <div className="relative z-10 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl space-y-4">
          <div className="bg-surface border border-border rounded clip-corner p-5 space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
                <span className="text-primary">/ </span>OWNER LOGIN
              </h1>
              <p className="text-xs font-mono text-subtle">
                Enter your email to receive a magic link.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-mono text-subtle uppercase" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                name="email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-testid="auth-login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com…"
                autoComplete="email"
                className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
              />
            </div>

            {sessionId && (
              <div className="text-xs font-mono text-subtle">
                Session ID:{" "}
                <span className="text-text" data-testid="auth-login-session-id">
                  {sessionId}
                </span>
              </div>
            )}

            {error && (
              <div data-testid="auth-login-error" className="border border-error/30 bg-error/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-error">Error</div>
                <div className="text-xs font-mono text-muted mt-1">{error}</div>
              </div>
            )}

            {submitState === "sent" && (
              <div data-testid="auth-login-sent" className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3 space-y-2">
                <div className="text-xs font-mono text-secondary">Magic link sent</div>
                <div className="text-xs font-mono text-muted">
                  Check your inbox for the login link. You can also verify manually below.
                </div>
                {expiresAt && (
                  <div className="text-xs font-mono text-subtle">Expires: {formatExpiresAt(expiresAt)}</div>
                )}
                {token && (
                  <div className="text-xs font-mono text-text break-all" data-testid="auth-login-token">
                    session_token={token}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Link
                    data-testid="auth-login-verify-link"
                    href={
                      sessionId
                        ? `/auth/verify?session_id=${encodeURIComponent(sessionId)}${token ? `&token=${encodeURIComponent(token)}` : ""}`
                        : "/auth/verify"
                    }
                    className="px-3 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
                  >
                    Verify now
                  </Link>
                  <button
                    onClick={resetAuth}
                    className="px-3 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
                  >
                    Start over
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                data-testid="auth-login-submit"
                onClick={onSend}
                disabled={!canSubmit}
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {submitState === "loading" ? "Sending…" : "Send magic link"}
              </button>
              <Link
                href="/settings/account"
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
              >
                My account
              </Link>
            </div>
          </div>

          <div className="text-xs font-mono text-subtle">
            Tip: if you already verified, head straight to <span className="text-text">/settings/account</span>.
          </div>
        </div>
      </div>
    </div>
  );
}
