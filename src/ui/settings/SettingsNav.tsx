import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { clearStoredOwnerAuth } from "../auth/ownerAuth";
import { getBrowserSupabaseClient } from "../auth/supabase-client";
import { clearStoredApiKey, clearStoredLastEventId } from "../developer/storage";

type SettingsNavCurrent = "account" | "identities" | "connected-apps" | "start";

type NavItem = {
  key: SettingsNavCurrent;
  href: string;
  labelKey: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "account", href: "/settings/account", labelKey: "nav.account" },
  { key: "identities", href: "/settings/identities", labelKey: "nav.identities" },
  { key: "connected-apps", href: "/settings/connected-apps", labelKey: "nav.connectedApps" },
  { key: "start", href: "/start", labelKey: "nav.connect" }
];

export default function SettingsNav({ current }: { current: SettingsNavCurrent }) {
  const router = useRouter();
  const t = useTranslations("settings");
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
    void router.replace("/auth/login", undefined, { locale: router.locale });
  }, [logoutState, router]);

  return (
    <nav
      data-testid="settings-nav"
      aria-label={t("nav.account")}
      className="mt-4 flex flex-wrap items-center gap-0"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.key === current;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "h-9 px-3.5 text-xs font-mono font-medium uppercase border-b-2 -mb-px transition-all flex items-center",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-text hover:border-border-strong"
            ].join(" ")}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
      <div className="ml-auto">
        <button
          type="button"
          data-testid="settings-logout"
          onClick={onLogout}
          disabled={logoutState === "loading"}
          className="h-9 px-3.5 text-xs font-mono font-medium uppercase border-b-2 -mb-px border-transparent text-error/70 hover:text-error hover:border-error/50 transition-all disabled:opacity-50 flex items-center"
        >
          {logoutState === "loading" ? t("nav.signingOut") : t("nav.logout")}
        </button>
      </div>
    </nav>
  );
}
