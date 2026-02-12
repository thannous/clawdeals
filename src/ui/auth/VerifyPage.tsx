import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  clearStoredOwnerAuth,
  getStoredOwnerEmail,
  getStoredOwnerSessionId,
  getStoredOwnerSessionToken,
  setStoredOwnerSessionId,
  setStoredOwnerSessionToken,
  clearStoredOwnerSessionId,
  clearStoredOwnerSessionToken
} from "./ownerAuth";

function getErrorMessage(body: any, status: number) {
  const error = body?.error;
  if (error?.message) return String(error.message);
  if (body?.message) return String(body.message);
  return `HTTP ${status}`;
}

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0] || "";
  if (typeof value === "string") return value;
  return "";
}

const EXPIRES_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function formatExpiresAt(expiresAt: string) {
  const d = new Date(expiresAt);
  if (!Number.isFinite(d.getTime())) return expiresAt;
  return EXPIRES_FORMATTER.format(d);
}

export default function VerifyPage() {
  const router = useRouter();
  const queryToken = useMemo(() => resolveQueryParam(router.query?.token).trim(), [router.query?.token]);
  const querySessionId = useMemo(() => {
    const raw = resolveQueryParam(router.query?.session_id).trim();
    if (raw) return raw;
    return resolveQueryParam(router.query?.sessionId).trim();
  }, [router.query?.session_id, router.query?.sessionId]);

  const [email] = useState<string | null>(() => getStoredOwnerEmail());
  const [sessionId, setSessionId] = useState<string>(() => getStoredOwnerSessionId() || "");
  const [token, setToken] = useState<string>(() => getStoredOwnerSessionToken() || "");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const autoSubmitRef = useRef(false);

  const confirm = useCallback(
    async ({ sessionId: rawSessionId, token: rawToken }: { sessionId: string; token: string }) => {
      const sid = rawSessionId.trim();
      const tok = rawToken.trim();

      if (!sid) {
        setError("Missing session ID. Start from the login page.");
        setSubmitState("error");
        return;
      }
      if (!tok) {
        setError("Enter your verification token.");
        setSubmitState("error");
        return;
      }

      setSubmitState("loading");
      setError(null);

      try {
        const res = await fetch("/api/v1/auth/login:confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ session_id: sid, token: tok })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(getErrorMessage(body, res.status));
        }

        clearStoredOwnerSessionToken();
        clearStoredOwnerSessionId();
        setSubmitState("success");
        setError(null);
        void router.replace("/settings/identities");
      } catch (err: any) {
        setError(String(err?.message || "Verification failed"));
        setSubmitState("error");
      }
    },
    [router]
  );

  useEffect(() => {
    if (!router.isReady) return;
    if (querySessionId) {
      setSessionId(querySessionId);
      setStoredOwnerSessionId(querySessionId);
    }
    if (queryToken) {
      setToken(queryToken);
      setStoredOwnerSessionToken(queryToken);
    }

    if (querySessionId && queryToken && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      void confirm({ sessionId: querySessionId, token: queryToken });
    }
  }, [router.isReady, querySessionId, queryToken, confirm]);

  const canSubmit = useMemo(
    () => Boolean(sessionId.trim() && token.trim() && submitState !== "loading"),
    [sessionId, token, submitState]
  );

  const onVerify = useCallback(async () => {
    await confirm({ sessionId, token });
  }, [confirm, sessionId, token]);

  const onResend = useCallback(async () => {
    if (!email) {
      setError("Missing email. Start from the login page.");
      setSubmitState("error");
      return;
    }

    setSubmitState("loading");
    setError(null);

    try {
      const res = await fetch("/api/v1/auth/login:start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getErrorMessage(body, res.status));
      }

      const nextSessionId = body?.data?.session_id ? String(body.data.session_id) : null;
      const nextToken = body?.data?.session_token ? String(body.data.session_token) : null;
      const nextExpires = body?.data?.expires_at ? String(body.data.expires_at) : null;

      if (nextSessionId) {
        setStoredOwnerSessionId(nextSessionId);
        setSessionId(nextSessionId);
      }
      if (nextToken) {
        setStoredOwnerSessionToken(nextToken);
        setToken(nextToken);
      }
      setExpiresAt(nextExpires || null);
      setSubmitState("idle");
    } catch (err: any) {
      setError(String(err?.message || "Failed to resend"));
      setSubmitState("error");
    }
  }, [email]);

  const onReset = useCallback(() => {
    void fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    clearStoredOwnerAuth();
    setSessionId("");
    setToken("");
    setExpiresAt(null);
    setSubmitState("idle");
    setError(null);
  }, []);

  return (
    <div data-testid="auth-verify-page" className="min-h-screen bg-bg relative overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-60" />
      <div className="animate-scanline" />

      <div className="relative z-10 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl space-y-4">
          <div className="bg-surface border border-border rounded clip-corner p-5 space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
                <span className="text-primary">/ </span>VERIFY LOGIN
              </h1>
              <p className="text-xs font-mono text-subtle">
                Enter the token from your magic link to complete owner login.
              </p>
            </div>

            {email && (
              <div className="text-xs font-mono text-subtle">
                Email: <span className="text-text">{email}</span>
              </div>
            )}

            {sessionId.trim() && (
              <div className="text-xs font-mono text-subtle">
                Session ID: <span className="text-text">{sessionId}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-mono text-subtle uppercase" htmlFor="auth-token">
                Verification token
              </label>
              <input
                id="auth-token"
                name="token"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-testid="auth-verify-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token…"
                autoComplete="one-time-code"
                className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
              />
            </div>

            {expiresAt && (
              <div className="text-xs font-mono text-subtle">Expires: {formatExpiresAt(expiresAt)}</div>
            )}

            {error && (
              <div data-testid="auth-verify-error" className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-red-400">Error</div>
                <div className="text-xs font-mono text-muted mt-1">{error}</div>
              </div>
            )}

            {submitState === "success" && (
              <div data-testid="auth-verify-success" className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-secondary">Verified</div>
                <div className="text-xs font-mono text-muted mt-1">
                  Login completed. You can now open your account dashboard.
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                data-testid="auth-verify-submit"
                onClick={onVerify}
                disabled={!canSubmit}
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {submitState === "loading" ? "Verifying…" : "Verify"}
              </button>
              <button
                data-testid="auth-verify-resend"
                onClick={onResend}
                disabled={!email || submitState === "loading"}
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors disabled:opacity-50"
              >
                Resend
              </button>
              <Link
                href="/settings/account"
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
              >
                My account
              </Link>
              <button
                onClick={onReset}
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
              >
                Start over
              </button>
            </div>
          </div>

          {!sessionId.trim() && (
            <div className="text-xs font-mono text-subtle">
              Missing session ID. Return to{" "}
              <Link href="/auth/login-legacy" className="text-text underline">
                /auth/login-legacy
              </Link>
              .
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
