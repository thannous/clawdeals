import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import { clearStoredOwnerAuth } from "../auth/ownerAuth";
import { getBrowserSupabaseClient } from "../auth/supabase-client";

type SettingsNavCurrent = "account" | "identities" | "connected-apps";

type NavItem = {
  key: SettingsNavCurrent;
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "account", href: "/settings/account", label: "Account" },
  { key: "identities", href: "/settings/identities", label: "Linked Identities" },
  { key: "connected-apps", href: "/settings/connected-apps", label: "Connected Apps" }
];

export default function SettingsNav({ current }: { current: SettingsNavCurrent }) {
  const router = useRouter();
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
      await supabase.auth.signOut();
    } catch {
      // Best-effort only.
    }
    clearStoredOwnerAuth();
    void router.replace("/auth/login");
  }, [logoutState, router]);

  return (
    <nav data-testid="settings-nav" aria-label="Settings navigation" className="mt-4 flex flex-wrap items-center gap-2">
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
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/start"
        className="px-3.5 py-2 text-xs font-mono font-bold uppercase border border-transparent text-muted rounded-md hover:text-text hover:bg-surface-alt/40 transition-all"
      >
        Start
      </Link>
      <div className="ml-auto">
        <button
          type="button"
          data-testid="settings-logout"
          onClick={onLogout}
          disabled={logoutState === "loading"}
          className="px-3.5 py-2 text-xs font-mono font-bold uppercase border border-error/30 text-error/80 rounded-md hover:bg-error/10 hover:text-error transition-all disabled:opacity-50"
        >
          {logoutState === "loading" ? "Signing out..." : "Logout"}
        </button>
      </div>
    </nav>
  );
}
