import Link from "next/link";
import { useTranslations } from "next-intl";

type AppNavCurrent = "deals" | "listings" | "approvals" | "offers" | "threads" | "developer" | "settings";

type NavItem = {
  key: AppNavCurrent;
  href: string;
  labelKey: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "deals", href: "/deals", labelKey: "nav.deals" },
  { key: "listings", href: "/my/listings", labelKey: "nav.listings" },
  { key: "approvals", href: "/my/approvals", labelKey: "nav.approvals" },
  { key: "offers", href: "/my/offers", labelKey: "nav.offers" },
  { key: "threads", href: "/my/threads", labelKey: "nav.threads" },
  { key: "developer", href: "/developer", labelKey: "nav.developer" },
  { key: "settings", href: "/settings/account", labelKey: "nav.settings" },
];

export default function AppNav({ current }: { current: AppNavCurrent }) {
  const t = useTranslations("appNav");

  return (
    <nav
      data-testid="app-nav"
      aria-label="Main navigation"
      className="mt-4 flex items-center gap-2 overflow-x-auto"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.key === current;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "h-9 px-3.5 text-xs font-mono font-bold uppercase border rounded-md transition-all flex items-center whitespace-nowrap",
              active
                ? "border-primary/50 text-primary bg-primary/8"
                : "border-transparent text-muted hover:text-text hover:bg-surface-alt/40"
            ].join(" ")}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
