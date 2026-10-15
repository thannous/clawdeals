import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useReducer, useRef } from "react";

import { getBrowserSupabaseClient } from "./supabase-client";
import { safeRedirectUrl } from "./safeRedirect";

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
  recoveryReady: boolean;
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
  notice: null,
  recoveryReady: false
};

function resetPasswordReducer(state: ResetPasswordState, action: ResetPasswordAction): ResetPasswordState {
  switch (action.type) {
    case "setPassword":
      return { ...state, password: action.value };
    case "setConfirmPassword":
      return { ...state, confirmPassword: action.value };
    case "setReady":
      return { ...state, status: "ready", recoveryReady: true, error: null };
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
  const t = useTranslations("ownerReset");
  const [state, dispatch] = useReducer(resetPasswordReducer, INITIAL_STATE);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    async function checkRecoverySession() {
      try {
        const queryError = resolveQueryParam(router.query?.error).trim();
        if (queryError) {
          throw new Error(t("invalidLink"));
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
          throw new Error(t("invalidLink"));
        }

        dispatch({ type: "setReady" });
      } catch {
        dispatch({ type: "setError", error: t("invalidLink") });
      }
    }

    void checkRecoverySession();
  }, [router, t]);

  const onUpdatePassword = useCallback(async () => {
    if (!state.recoveryReady || state.status === "saving" || state.status === "success") return;
    if (state.password.length < 8) {
      dispatch({ type: "setError", error: t("tooShort") });
      return;
    }
    if (state.password !== state.confirmPassword) {
      dispatch({ type: "setError", error: t("mismatch") });
      return;
    }

    dispatch({ type: "setSaving" });

    try {
      const supabase = getBrowserSupabaseClient();
      const updated = await supabase.auth.updateUser({ password: state.password });
      if (updated.error) throw updated.error;

      await supabase.auth.signOut().catch(() => {});
      dispatch({ type: "setSuccess", notice: t("updated") });
    } catch {
      dispatch({ type: "setError", error: t("updateError") });
    }
  }, [state.confirmPassword, state.password, state.status, state.recoveryReady, t]);

  return (
    <div data-testid="auth-reset-page" className="min-h-screen bg-bg relative overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-60" />
      <div className="animate-scanline" />

      <div className="relative z-10 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl space-y-4">
          <div className="bg-surface border border-border rounded clip-corner p-5 space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
                <span className="text-primary">/ </span>{t("title")}
              </h1>
              <p className="text-xs font-mono text-subtle">
                {t("intro")}
              </p>
            </div>

            {state.status === "checking" && <div role="status" className="text-xs font-mono text-subtle">{t("checking")}</div>}

            {state.recoveryReady && state.status !== "success" && (
              <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void onUpdatePassword(); }}>
                <div className="space-y-2">
                  <label className="block text-xs font-mono text-subtle uppercase" htmlFor="auth-reset-password">
                    {t("password")}
                  </label>
                  <input
                    id="auth-reset-password"
                    name="password"
                    required
                    minLength={8}
                    disabled={state.status === "saving"}
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
                    {t("confirmPassword")}
                  </label>
                  <input
                    id="auth-reset-password-confirm"
                    name="confirmPassword"
                    required
                    minLength={8}
                    disabled={state.status === "saving"}
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
                  type="submit"
                  disabled={state.status === "saving"}
                  className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {t(state.status === "saving" ? "saving" : "submit")}
                </button>
              </form>
            )}

            {state.error && (
              <div role="alert" data-testid="auth-reset-error" className="border border-error/30 bg-error/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-error">{t("error")}</div>
                <div className="text-xs font-mono text-muted mt-1">{state.error}</div>
              </div>
            )}

            {state.notice && (
              <div
                data-testid="auth-reset-notice"
                role="status"
                className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3"
              >
                <div className="text-xs font-mono text-secondary">{t("success")}</div>
                <div className="text-xs font-mono text-muted mt-1">{state.notice}</div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/auth/login?next=${encodeURIComponent(safeRedirectUrl(router.query.next))}`}
                className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
              >
                {t(state.status === "error" && !state.recoveryReady ? "requestLink" : "backToLogin")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
