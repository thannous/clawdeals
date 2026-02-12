import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import { clearStoredOwnerAuth } from "../auth/ownerAuth";

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
    clearStoredOwnerAuth();
    void router.replace("/auth/login");
  }, [logoutState, router]);

  return (
    <nav data-testid="settings-nav" aria-label="Settings navigation" className="mt-3 flex flex-wrap items-center gap-2">
      {NAV_ITEMS.map((item) => {
        const active = item.key === current;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "px-3 py-1.5 text-xs font-mono font-bold uppercase border rounded transition-colors",
              active
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-muted hover:border-border-strong hover:text-text"
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/start"
        className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
      >
        Start
      </Link>
      <button
        type="button"
        data-testid="settings-logout"
        onClick={onLogout}
        disabled={logoutState === "loading"}
        className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-error/40 text-error rounded hover:bg-error/10 transition-colors disabled:opacity-50"
      >
        {logoutState === "loading" ? "Signing out..." : "Logout"}
      </button>
    </nav>
  );
}
