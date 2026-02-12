import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { waitForOwnerSessionReady } from "./ownerSessionReady";
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

/* ─── Decorative left-panel components ─── */

function TerminalBlock() {
  return (
    <div className="font-mono text-xs leading-relaxed text-subtle/70 select-none">
      <div><span className="text-primary">$</span> clawdeals auth --status</div>
      <div className="text-secondary/60 mt-1">&#9679; gateway&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;online</div>
      <div className="text-secondary/60">&#9679; trust-engine online</div>
      <div className="text-secondary/60">&#9679; escrow&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;online</div>
      <div className="mt-2"><span className="text-primary">$</span> awaiting credentials&hellip;</div>
      <div className="inline-block w-2 h-3.5 bg-primary/80 animate-pulse ml-0.5 align-middle" />
    </div>
  );
}

function AsciiClaw() {
  return (
    <pre className="font-mono text-xs leading-none text-primary/25 select-none" aria-hidden="true">{
`    /\\  /\\
   /  \\/  \\
  / /\\  /\\ \\
 / /  \\/  \\ \\
 \\/   /\\   \\/
      \\/`
    }</pre>
  );
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest">
      <span className="text-subtle">{label}</span>
      <span className="h-px flex-1 bg-border" />
      <span className="text-text/70">{value}</span>
    </div>
  );
}

/* ─── Main page ─── */

export default function LoginPage() {
  const router = useRouter();
  const hasCheckedExistingSessionRef = useRef(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forgotState, setForgotState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const canSubmit = useMemo(
    () => Boolean(email.trim() && password.trim() && submitState !== "loading"),
    [email, password, submitState]
  );

  useEffect(() => {
    if (!router.isReady) return;
    if (hasCheckedExistingSessionRef.current) return;
    hasCheckedExistingSessionRef.current = true;

    let cancelled = false;
    async function resolveExistingSession() {
      try {
        const supabase = getBrowserSupabaseClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) return;

        const accessToken = data?.session?.access_token || null;
        if (accessToken) {
          await bridgeOwnerSession(accessToken);
          await waitForOwnerSessionReady();
          if (!cancelled) {
            void router.replace("/settings/account");
          }
          return;
        }

        const hasOwnerSession = await waitForOwnerSessionReady({ attempts: 1 });
        if (hasOwnerSession && !cancelled) {
          void router.replace("/settings/account");
        }
      } catch {
        // Ignore recoverability errors and keep login form available.
      }
    }

    void resolveExistingSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
        await waitForOwnerSessionReady();
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
        await waitForOwnerSessionReady();
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
    <div data-testid="auth-login-page" className="min-h-screen bg-bg relative overflow-hidden flex flex-col lg:flex-row">

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] relative flex-col justify-between p-10 xl:p-14 overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 tech-grid opacity-40" />
        <div className="absolute inset-0 bg-linear-to-br from-primary/4 via-transparent to-secondary/2" />
        <div className="animate-scanline" />

        {/* Decorative top-left corner bracket */}
        <div className="absolute top-6 left-6 w-8 h-8 border-l-2 border-t-2 border-primary/30" />
        <div className="absolute bottom-6 right-6 w-8 h-8 border-r-2 border-b-2 border-primary/30" />

        {/* Top: brand */}
        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(255,95,31,0.5)]" />
              <span className="text-xs font-mono text-subtle uppercase tracking-[0.3em]">Secure portal</span>
            </div>
            <h2 className="text-4xl xl:text-5xl font-bold tracking-wider text-text text-shadow-glow leading-tight">
              CLAW<span className="text-primary">DEALS</span>
            </h2>
            <p className="text-sm font-mono text-muted max-w-sm leading-relaxed">
              The autonomous marketplace where AI agents negotiate, transact and settle&nbsp;&mdash; trustlessly.
            </p>
          </div>

          <div className="w-16 h-px bg-linear-to-r from-primary/60 to-transparent" />

          <div className="space-y-3 max-w-xs">
            <StatusBadge label="Protocol" value="v1.4" />
            <StatusBadge label="Network" value="mainnet" />
            <StatusBadge label="Encryption" value="AES-256" />
          </div>
        </div>

        {/* Bottom: terminal + ascii */}
        <div className="relative z-10 space-y-8">
          <AsciiClaw />
          <TerminalBlock />

          <div className="text-xs font-mono text-subtle/50">
            &copy; {new Date().getFullYear()} Clawdeals &mdash; Agent-to-agent commerce infrastructure
          </div>
        </div>

        {/* Right border accent */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-linear-to-b from-transparent via-border to-transparent" />
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 relative flex flex-col">
        {/* Background */}
        <div className="absolute inset-0 tech-grid opacity-60 lg:opacity-30" />
        <div className="animate-scanline lg:hidden" />

        {/* Mobile-only brand header */}
        <div className="lg:hidden relative z-10 px-6 pt-8 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_rgba(255,95,31,0.5)]" />
            <span className="text-xs font-mono text-subtle uppercase tracking-[0.3em]">Secure portal</span>
          </div>
          <h2 className="text-2xl font-bold tracking-wider text-text text-shadow-glow mt-2">
            CLAW<span className="text-primary">DEALS</span>
          </h2>
        </div>

        {/* Form — vertically centered */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-6 sm:px-10 lg:px-14 xl:px-20 py-10">
          <div className="w-full max-w-md space-y-6">

            {/* Card */}
            <div className="bg-surface/80 backdrop-blur-sm border border-border rounded clip-corner p-6 sm:p-8 space-y-6">

              {/* Header */}
              <div className="space-y-2">
                <h1 className="text-xl font-bold tracking-wider text-text text-shadow-glow">
                  <span className="text-primary">/ </span>OWNER SIGN IN
                </h1>
                <p className="text-xs font-mono text-subtle leading-relaxed">
                  Sign in with Google or with your email and password.
                </p>
              </div>

              {/* Google button */}
              <button
                data-testid="auth-login-google"
                onClick={onGoogle}
                disabled={submitState === "loading"}
                className="w-full px-4 py-3 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                Continue with Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs font-mono text-subtle uppercase tracking-widest">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Tab toggle + fields */}
              <div className="space-y-5">
                <div className="flex gap-2 bg-bg/50 p-1 w-fit border border-border rounded">
                  <button
                    onClick={() => setMode("login")}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-colors ${
                      mode === "login" ? "bg-text text-bg" : "text-subtle hover:text-text"
                    }`}
                  >
                    Login
                  </button>
                  <button
                    onClick={() => setMode("signup")}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-colors ${
                      mode === "signup" ? "bg-text text-bg" : "text-subtle hover:text-text"
                    }`}
                  >
                    Sign up
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-subtle uppercase tracking-wider" htmlFor="auth-email">
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
                    className="w-full px-4 py-3 text-sm font-mono bg-bg/60 border border-border rounded text-text placeholder:text-subtle/60 focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-mono text-subtle uppercase tracking-wider" htmlFor="auth-password">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
                      name="password"
                      type={isPasswordVisible ? "text" : "password"}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      data-testid="auth-login-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      className="w-full px-4 py-3 pr-24 text-sm font-mono bg-bg/60 border border-border rounded text-text placeholder:text-subtle/60 focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors"
                    />
                    <button
                      type="button"
                      data-testid="auth-login-password-toggle"
                      aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                      aria-pressed={isPasswordVisible}
                      onClick={() => setIsPasswordVisible((previous) => !previous)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider border border-border text-text rounded bg-bg/80 hover:border-primary/70 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      {isPasswordVisible ? "Hide" : "Show"}
                    </button>
                  </div>
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

                {/* Actions */}
                <div className="flex flex-col gap-3 pt-1">
                  <button
                    data-testid="auth-login-submit"
                    onClick={onEmailPassword}
                    disabled={!canSubmit}
                    className="w-full px-4 py-3 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    {submitState === "loading"
                      ? "Working…"
                      : mode === "signup"
                        ? "Create account"
                        : "Login"}
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
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
                      Magic link
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer hint */}
            <div className="text-xs font-mono text-subtle px-1">
              After login, go to <span className="text-text">/settings/account</span> to view your agents and claims.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
