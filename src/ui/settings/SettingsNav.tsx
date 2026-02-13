import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import { clearStoredOwnerAuth } from "../auth/ownerAuth";
import { getBrowserSupabaseClient } from "../auth/supabase-client";
import { clearStoredApiKey, clearStoredLastEventId } from "../developer/storage";

type SettingsNavCurrent = "account" | "identities" | "connected-apps" | "start";

type NavItem = {
  key: SettingsNavCurrent;
  href: string;
  label: {
    en: string;
    fr: string;
  };
};

const NAV_ITEMS: NavItem[] = [
  { key: "account", href: "/settings/account", label: { en: "Account", fr: "Compte" } },
  { key: "identities", href: "/settings/identities", label: { en: "Linked Identities", fr: "Identites liees" } },
  { key: "connected-apps", href: "/settings/connected-apps", label: { en: "Connected Apps", fr: "Apps connectees" } },
  { key: "start", href: "/start", label: { en: "Connect", fr: "Connexion" } }
];

export default function SettingsNav({ current, locale }: { current: SettingsNavCurrent; locale?: "en" | "fr" }) {
  const router = useRouter();
  const resolvedLocale = locale || (router.locale === "fr" ? "fr" : "en");
  const isFr = resolvedLocale === "fr";
  const [logoutState, setLogoutState] = useState<"idle" | "loading">("idle");

  const onLogout = useCallback(async () => {
    if (logoutState === "loading") return;
    setLogoutState("loading");
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Always clear local state and redirect to login even if logout endpoint fails.
    }
    try {
      // Ensure we don't immediately re-bridge an existing Supabase session on /auth/login.
      const supabase = getBrowserSupabaseClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Best-effort only.
    }
    // Keep owner logout semantics consistent with /start: remove local developer session artifacts.
    clearStoredApiKey();
    clearStoredLastEventId();
    clearStoredOwnerAuth();
    void router.replace("/auth/login", undefined, { locale: resolvedLocale });
  }, [logoutState, resolvedLocale, router]);

  return (
    <nav
      data-testid="settings-nav"
      aria-label={isFr ? "Navigation des parametres" : "Settings navigation"}
      className="mt-4 flex flex-wrap items-center gap-2"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.key === current;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "px-3.5 py-2 text-xs font-mono font-bold uppercase border rounded-md transition-all",
              active
                ? "border-primary/50 text-primary bg-primary/8"
                : "border-transparent text-muted hover:text-text hover:bg-surface-alt/40"
            ].join(" ")}
          >
            {isFr ? item.label.fr : item.label.en}
          </Link>
        );
      })}
      <div className="ml-auto">
        <button
          type="button"
          data-testid="settings-logout"
          onClick={onLogout}
          disabled={logoutState === "loading"}
          className="px-3.5 py-2 text-xs font-mono font-bold uppercase border border-error/30 text-error/80 rounded-md hover:bg-error/10 hover:text-error transition-all disabled:opacity-50"
        >
          {logoutState === "loading"
            ? (isFr ? "Deconnexion..." : "Signing out...")
            : (isFr ? "Deconnexion" : "Logout")}
        </button>
      </div>
    </nav>
  );
}
