import Link from "next/link";

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
    </nav>
  );
}
