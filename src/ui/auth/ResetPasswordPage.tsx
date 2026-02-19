import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { getBrowserSupabaseClient } from "./supabase-client";

function resolveQueryParam(value: unknown): string {
  if (Array.isArray(value)) return value[0] || "";
  if (typeof value === "string") return value;
  return "";
}

type ResetPasswordState = {
  password: string;
  confirmPassword: string;
  status: "checking" | "ready" | "saving" | "success" | "error";
  error: string | null;
  notice: string | null;
};

type ResetPasswordAction =
  | { type: "setPassword"; value: string }
  | { type: "setConfirmPassword"; value: string }
  | { type: "setReady" }
  | { type: "setSaving" }
  | { type: "setSuccess"; notice: string }
  | { type: "setError"; error: string };

const INITIAL_STATE: ResetPasswordState = {
  password: "",
  confirmPassword: "",
  status: "checking",
  error: null,
  notice: null
};

function resetPasswordReducer(state: ResetPasswordState, action: ResetPasswordAction): ResetPasswordState {
  switch (action.type) {
    case "setPassword":
      return { ...state, password: action.value };
    case "setConfirmPassword":
      return { ...state, confirmPassword: action.value };
    case "setReady":
      return { ...state, status: "ready", error: null };
    case "setSaving":
      return { ...state, status: "saving", error: null, notice: null };
    case "setSuccess":
      return { ...state, status: "success", error: null, notice: action.notice };
    case "setError":
      return { ...state, status: "error", error: action.error };
    default:
      return state;
  }
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(resetPasswordReducer, INITIAL_STATE);
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

        dispatch({ type: "setReady" });
      } catch (err: any) {
        dispatch({ type: "setError", error: String(err?.message || "Invalid or expired reset link") });
      }
    }

    void checkRecoverySession();
  }, [router]);

  const onUpdatePassword = useCallback(async () => {
    if (state.status === "saving") return;
    if (state.password.length < 8) {
      dispatch({ type: "setError", error: "Password must be at least 8 characters." });
      return;
    }
    if (state.password !== state.confirmPassword) {
      dispatch({ type: "setError", error: "Passwords do not match." });
      return;
    }

    dispatch({ type: "setSaving" });

    try {
      const supabase = getBrowserSupabaseClient();
      const updated = await supabase.auth.updateUser({ password: state.password });
      if (updated.error) throw updated.error;

      await supabase.auth.signOut().catch(() => {});
      dispatch({ type: "setSuccess", notice: "Password updated. You can now sign in." });
    } catch (err: any) {
      dispatch({ type: "setError", error: String(err?.message || "Failed to update password") });
    }
  }, [state.confirmPassword, state.password, state.status]);

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

            {state.status === "checking" && <div className="text-xs font-mono text-subtle">Validating reset link...</div>}

            {(state.status === "ready" || state.status === "saving" || state.status === "error") && (
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
                    value={state.password}
                    onChange={(e) => dispatch({ type: "setPassword", value: e.target.value })}
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
                    value={state.confirmPassword}
                    onChange={(e) => dispatch({ type: "setConfirmPassword", value: e.target.value })}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                  />
                </div>

                <button
                  data-testid="auth-reset-submit"
                  onClick={onUpdatePassword}
                  disabled={state.status === "saving"}
                  className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {state.status === "saving" ? "Updating..." : "Update password"}
                </button>
              </div>
            )}

            {state.error && (
              <div data-testid="auth-reset-error" className="border border-error/30 bg-error/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-error">Error</div>
                <div className="text-xs font-mono text-muted mt-1">{state.error}</div>
              </div>
            )}

            {state.notice && (
              <div
                data-testid="auth-reset-notice"
                className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3"
              >
                <div className="text-xs font-mono text-secondary">Success</div>
                <div className="text-xs font-mono text-muted mt-1">{state.notice}</div>
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
