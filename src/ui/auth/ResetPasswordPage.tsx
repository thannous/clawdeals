import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

import { getBrowserSupabaseClient } from "./supabase-client";

function resolveQueryParam(value: unknown): string {
  if (Array.isArray(value)) return value[0] || "";
  if (typeof value === "string") return value;
  return "";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<"checking" | "ready" | "saving" | "success" | "error">("checking");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    async function checkRecoverySession() {
      try {
        const queryError = resolveQueryParam(router.query?.error).trim();
        const queryErrorDescription = resolveQueryParam(router.query?.error_description).trim();
        if (queryError) {
          throw new Error(queryErrorDescription || queryError);
        }

        const supabase = getBrowserSupabaseClient();
        let session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          const code = resolveQueryParam(router.query?.code).trim();
          if (code) {
            const exchanged = await supabase.auth.exchangeCodeForSession(code);
            if (exchanged.error) throw exchanged.error;
            session = exchanged.data?.session || null;
          }
        }

        if (!session) {
          throw new Error("Recovery session not found. Please open the reset link from your email.");
        }

        setState("ready");
      } catch (err: any) {
        setState("error");
        setError(String(err?.message || "Invalid or expired reset link"));
      }
    }

    void checkRecoverySession();
  }, [router]);

  const onUpdatePassword = useCallback(async () => {
    if (state === "saving") return;
    if (password.length < 8) {
      setState("error");
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setState("error");
      setError("Passwords do not match.");
      return;
    }

    setState("saving");
    setError(null);
    setNotice(null);

    try {
      const supabase = getBrowserSupabaseClient();
      const updated = await supabase.auth.updateUser({ password });
      if (updated.error) throw updated.error;

      await supabase.auth.signOut().catch(() => {});
      setState("success");
      setNotice("Password updated. You can now sign in.");
    } catch (err: any) {
      setState("error");
      setError(String(err?.message || "Failed to update password"));
    }
  }, [confirmPassword, password, state]);

  return (
    <div data-testid="auth-reset-page" className="min-h-screen bg-bg relative overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-60" />
      <div className="animate-scanline" />

      <div className="relative z-10 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl space-y-4">
          <div className="bg-surface border border-border rounded clip-corner p-5 space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
                <span className="text-primary">/ </span>RESET PASSWORD
              </h1>
              <p className="text-xs font-mono text-subtle">
                Set a new password for your account. Use at least 8 characters.
              </p>
            </div>

            {state === "checking" && <div className="text-xs font-mono text-subtle">Validating reset link...</div>}

            {(state === "ready" || state === "saving" || state === "error") && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="block text-xs font-mono text-subtle uppercase" htmlFor="auth-reset-password">
                    New password
                  </label>
                  <input
                    id="auth-reset-password"
                    name="password"
                    type="password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    data-testid="auth-reset-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    className="block text-xs font-mono text-subtle uppercase"
                    htmlFor="auth-reset-password-confirm"
                  >
                    Confirm password
                  </label>
                  <input
                    id="auth-reset-password-confirm"
                    name="confirmPassword"
                    type="password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    data-testid="auth-reset-password-confirm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                  />
                </div>

                <button
                  data-testid="auth-reset-submit"
                  onClick={onUpdatePassword}
                  disabled={state === "saving"}
                  className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {state === "saving" ? "Updating..." : "Update password"}
                </button>
              </div>
            )}

            {error && (
              <div data-testid="auth-reset-error" className="border border-error/30 bg-error/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-error">Error</div>
                <div className="text-xs font-mono text-muted mt-1">{error}</div>
              </div>
            )}

            {notice && (
              <div
                data-testid="auth-reset-notice"
                className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3"
              >
                <div className="text-xs font-mono text-secondary">Success</div>
                <div className="text-xs font-mono text-muted mt-1">{notice}</div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/auth/login"
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
              >
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
