import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { localePrefixFor } from "../../shared/seo";

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

export default function PairPage() {
  const router = useRouter();
  const t = useTranslations("pair");
  const common = useTranslations("common");
  const token = useMemo(() => resolveQueryParam(router.query?.token).trim(), [router.query?.token]);
  const locale = router.locale === "fr" || router.locale === "es" ? router.locale : "en";
  const returnPath = `${localePrefixFor(locale)}/pair?${new URLSearchParams({ token })}`;
  const loginHref = `/auth/login?next=${encodeURIComponent(returnPath)}`;

  const [submitState, setSubmitState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [resultState, setResultState] = useState<string | null>(null);

  const onConfirm = useCallback(async () => {
    if (submitState === "loading" || submitState === "done") return;
    if (!token) {
      setError(t("newLink"));
      setSubmitState("error");
      return;
    }

    setSubmitState("loading");
    setError(null);
    setAuthRequired(false);

    try {
      const resp = await fetch("/api/console/channels/telegram/pair:confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": randomIdempotencyKey()
        },
        body: JSON.stringify({ pair_token: token })
      });

      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const code = body?.error?.code;
        const knownErrors: Record<string, string> = {
          PAIR_TOKEN_EXPIRED: t("expired"),
          PAIR_TOKEN_USED: t("used"),
          PAIR_TOKEN_INVALID: t("invalid"),
          CHANNEL_ALREADY_PAIRED: t("alreadyPaired")
        };
        setAuthRequired(resp.status === 401);
        setError(resp.status === 401
          ? t("signInRequired")
          : knownErrors[code] || body?.error?.message || common("somethingWentWrong"));
        setSubmitState("error");
        return;
      }

      const state = body?.data?.state || body?.state || null;
      setResultState(state ? String(state) : null);
      setSubmitState("done");
    } catch {
      setError(common("somethingWentWrong"));
      setSubmitState("error");
    }
  }, [submitState, token, t, common]);

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-surface border border-border rounded clip-corner p-5 space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>{t("title")}
          </h1>
          <p className="text-xs font-mono text-subtle">{t("subtitle")}</p>
        </div>

        {!token && router.isReady && (
          <div role="alert" className="border border-error/30 bg-error/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-error">{t("missingToken")}</div>
            <div className="text-xs font-mono text-muted mt-1">{t("newLink")}</div>
          </div>
        )}

        {token && submitState !== "done" && (
          <p className="text-xs font-mono text-muted">{t("ready")}</p>
        )}

        {error && (
          <div role="alert" className="border border-error/30 bg-error/5 rounded clip-corner p-3 space-y-3">
            <div className="text-xs font-mono text-error">{error}</div>
            {authRequired && (
              <Link
                href={loginHref}
                className="inline-block px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
              >
                {t("signIn")}
              </Link>
            )}
          </div>
        )}

        {submitState === "done" && (
          <div role="status" className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-secondary">{common("success")}</div>
            <div className="text-xs font-mono text-muted mt-1">
              {resultState === "PAIRED" ? t("paired") : resultState === "PENDING_APPROVAL" ? t("pending") : t("confirmed")}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={!token || submitState === "loading" || submitState === "done" || authRequired}
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {submitState === "loading" ? t("confirming") : t("confirm")}
          </button>
          <Link
            href="/settings/connected-apps"
            className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
          >
            {t("connectedApps")}
          </Link>
          {resultState === "PENDING_APPROVAL" && (
            <Link
              href="/my/approvals"
              className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
            >
              {t("approvals")}
            </Link>
          )}
        </div>

        <p className="text-xs font-mono text-subtle">{t("newLink")}</p>
      </div>
    </main>
  );
}
