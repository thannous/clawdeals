import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

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
}

export default function AuthCallbackPage() {
  const router = useRouter();
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
        void router.replace("/settings/account");
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
              <span className="text-primary">/ </span>AUTH CALLBACK
            </h1>
            {state === "loading" && <div className="text-xs font-mono text-subtle">Finalizing sign-in…</div>}
            {state === "error" && (
              <div className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-red-400">Error</div>
                <div className="text-xs font-mono text-muted mt-1">{error}</div>
                <Link
                  href="/auth/login"
                  className="inline-block mt-3 px-3 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
                >
                  Back to login
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
