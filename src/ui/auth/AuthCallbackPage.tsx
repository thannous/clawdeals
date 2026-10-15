import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { probeOwnerSession } from "./ownerSessionProbe";
import { waitForOwnerSessionReady } from "./ownerSessionReady";
import { safeRedirectUrl } from "./safeRedirect";
import { getBrowserSupabaseClient } from "./supabase-client";
import { missionDraftSourceFromUrl, readBuyMissionDraft } from "../webmcp/buyMissionDraft";

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
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const t = useTranslations("auth.callback");
  const verify = useTranslations("auth.verify");
  const [missionReturn, setMissionReturn] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    async function run() {
      try {
        const supabase = getBrowserSupabaseClient();
        let session = (await supabase.auth.getSession()).data.session;

        if (!session) {
          const codeRaw = typeof router.query?.code === "string" ? router.query.code : null;
          const code = codeRaw ? codeRaw.trim() : "";
          if (code) {
            const exchanged = await supabase.auth.exchangeCodeForSession(code);
            if (exchanged.error) throw exchanged.error;
            session = exchanged.data?.session || null;
          }
        }

        const accessToken = session?.access_token || null;
        if (!accessToken) {
          throw new Error("Missing session token from Supabase callback.");
        }

        await bridgeOwnerSession(accessToken);
        await waitForOwnerSessionReady();

        const nextParam = typeof router.query?.next === "string" ? router.query.next : null;
        let storedNext: string | null = null;
        try { storedNext = sessionStorage.getItem("clawdeals.auth_next"); sessionStorage.removeItem("clawdeals.auth_next"); } catch {}
        const redirectTo = safeRedirectUrl(nextParam || storedNext);

        const draftSource = missionDraftSourceFromUrl(redirectTo);
        const owner = draftSource !== null ? await probeOwnerSession({ fresh: true }) : null;
        if (draftSource !== null && !readBuyMissionDraft(draftSource, owner?.state === "authenticated" ? owner.ownerId : null)) {
          // Email callbacks can open an independent tab. Authentication is
          // shared, but the private mission draft stays in the original tab.
          setMissionReturn(redirectTo);
          const returnLocale = /^\/(en|fr|es)\//.exec(redirectTo)?.[1] || "en";
          if (router.locale !== returnLocale) {
            // Keep the provider callback URL unchanged; localize only the
            // already authenticated recovery page, without auth tokens.
            await router.replace({ pathname: "/auth/callback", query: { next: redirectTo } }, undefined, { locale: returnLocale });
          }
          return;
        }
        void router.replace(redirectTo, undefined, { locale: false });
      } catch (err: any) {
        setState("error");
        setError(String(err?.message || "Authentication callback failed"));
      }
    }

    void run();
  }, [router]);

  return (
    <div data-testid="auth-callback-page" className="min-h-screen bg-bg relative overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-60" />
      <div className="animate-scanline" />
      <div className="relative z-10 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl space-y-4">
          <div className="bg-surface border border-border rounded clip-corner p-5 space-y-4">
            <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
              <span className="text-primary">/ </span>{t("title")}
            </h1>
            {state === "loading" && !missionReturn && <div className="text-xs font-mono text-subtle">{t("finalizing")}</div>}
            {missionReturn && (
              <div data-testid="auth-callback-mission-return" role="status" className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3 space-y-3">
                <p className="text-sm text-muted">{verify("missionOtherTab")}</p>
                <Link href={missionReturn} locale={false} className="inline-block text-sm text-primary underline">{verify("openMissionHere")}</Link>
              </div>
            )}
            {state === "error" && (
              <div className="border border-error/30 bg-error/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-error">{verify("error")}</div>
                <div className="text-xs font-mono text-muted mt-1">{error}</div>
                <Link
                  href="/auth/login"
                  className="inline-block mt-3 px-3 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
                >
                  {t("backToLogin")}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
