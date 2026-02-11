import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import { getBrowserSupabaseClient } from "./supabase-client";

function getErrorMessage(body: any, status: number) {
  const error = body?.error;
  if (error?.message) return String(error.message);
  if (body?.message) return String(body.message);
  return `HTTP ${status}`;
}

async function bridgeOwnerSession(accessToken: string) {
  const resp = await fetch("/api/v1/auth/session:bridge", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(getErrorMessage(body, resp.status));
  }
  return body?.data || null;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forgotState, setForgotState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const canSubmit = useMemo(
    () => Boolean(email.trim() && password.trim() && submitState !== "loading"),
    [email, password, submitState]
  );

  const onGoogle = useCallback(async () => {
    setSubmitState("loading");
    setError(null);
    setNotice(null);
    try {
      const supabase = getBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
      });
      if (oauthError) {
        throw oauthError;
      }
    } catch (err: any) {
      setSubmitState("error");
      setError(String(err?.message || "Google sign-in failed"));
    }
  }, []);

  const onEmailPassword = useCallback(async () => {
    if (!canSubmit) return;

    setSubmitState("loading");
    setError(null);
    setNotice(null);
    try {
      const supabase = getBrowserSupabaseClient();
      if (mode === "login") {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (signInError) throw signInError;
        const accessToken = data?.session?.access_token || null;
        if (!accessToken) {
          throw new Error("Missing session token");
        }
        await bridgeOwnerSession(accessToken);
        setSubmitState("done");
        void router.replace("/settings/account");
        return;
      }

      const emailRedirectTo = `${window.location.origin}/auth/callback`;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo }
      });
      if (signUpError) throw signUpError;

      const accessToken = data?.session?.access_token || null;
      if (accessToken) {
        await bridgeOwnerSession(accessToken);
        setSubmitState("done");
        void router.replace("/settings/account");
        return;
      }

      setSubmitState("done");
      setNotice("Account created. Check your inbox if email confirmation is enabled.");
    } catch (err: any) {
      setSubmitState("error");
      setError(String(err?.message || "Authentication failed"));
    }
  }, [canSubmit, email, mode, password, router]);

  const onForgotPassword = useCallback(async () => {
    if (!email.trim()) {
      setForgotState("error");
      setError("Enter your email first.");
      return;
    }
    setForgotState("loading");
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/reset`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) throw resetError;
      setForgotState("done");
      setNotice("Password reset email sent.");
    } catch (err: any) {
      setForgotState("error");
      setError(String(err?.message || "Failed to send reset email"));
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
                <span className="text-primary">/ </span>OWNER SIGN IN
              </h1>
              <p className="text-xs font-mono text-subtle">
                Sign in with Google or with your email and password.
              </p>
            </div>

            <button
              data-testid="auth-login-google"
              onClick={onGoogle}
              disabled={submitState === "loading"}
              className="w-full px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              Continue with Google
            </button>

            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex gap-2 bg-surface p-1 w-fit border border-border">
                <button
                  onClick={() => setMode("login")}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest ${
                    mode === "login" ? "bg-text text-bg" : "text-subtle hover:text-text"
                  }`}
                >
                  Login
                </button>
                <button
                  onClick={() => setMode("signup")}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest ${
                    mode === "signup" ? "bg-text text-bg" : "text-subtle hover:text-text"
                  }`}
                >
                  Sign up
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-mono text-subtle uppercase" htmlFor="auth-email">
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

              <div className="space-y-2">
                <label className="block text-[10px] font-mono text-subtle uppercase" htmlFor="auth-password">
                  Password
                </label>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-testid="auth-login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                />
              </div>

              {error && (
                <div data-testid="auth-login-error" className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
                  <div className="text-xs font-mono text-red-400">Error</div>
                  <div className="text-xs font-mono text-muted mt-1">{error}</div>
                </div>
              )}

              {notice && (
                <div data-testid="auth-login-notice" className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3">
                  <div className="text-xs font-mono text-secondary">Notice</div>
                  <div className="text-xs font-mono text-muted mt-1">{notice}</div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  data-testid="auth-login-submit"
                  onClick={onEmailPassword}
                  disabled={!canSubmit}
                  className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {submitState === "loading"
                    ? "Working…"
                    : mode === "signup"
                      ? "Create account"
                      : "Login"}
                </button>
                <button
                  data-testid="auth-login-forgot"
                  onClick={onForgotPassword}
                  disabled={forgotState === "loading" || submitState === "loading"}
                  className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors disabled:opacity-50"
                >
                  {forgotState === "loading" ? "Sending…" : "Forgot password"}
                </button>
                <Link
                  href="/auth/login-legacy"
                  data-testid="auth-login-legacy-link"
                  className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
                >
                  Magic link (legacy)
                </Link>
              </div>
            </div>
          </div>

          <div className="text-[10px] font-mono text-subtle">
            After login, go to <span className="text-text">/settings/account</span> to view your agents and claims.
          </div>
        </div>
      </div>
    </div>
  );
}
