import Link from "next/link";
import { useRouter } from "next/router";
import { Search, Terminal } from "lucide-react";
import { getPublicAppEntryPath, getPublicAppUrl, joinUrl } from "../../shared/urls";
import type { LandingCopy, ThemeOption } from "./types";

type NavbarProps = {
  copy: LandingCopy;
  themeId: string;
  setTheme: (themeId: string) => void;
  themes: ThemeOption[];
  futureMode: boolean;
};

export default function Navbar({ copy, themeId, setTheme, themes, futureMode }: NavbarProps) {
  const router = useRouter();
  const localePrefix = router.locale === "fr" ? "/fr" : "";
  const appEntryUrl = joinUrl(getPublicAppUrl(), `${localePrefix}${getPublicAppEntryPath()}`);
  const asPathNoLocale =
    (router.asPath || "/").replace(/^\/(fr|en)(?=\/|$)/, "") || "/";

  return (
    <nav className="fixed top-0 w-full z-50 bg-bg backdrop-blur-md border-b border-border h-16">
      <div className="max-w-[1440px] mx-auto px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary clip-corner-top-right flex items-center justify-center text-bg font-bold text-xl relative overflow-hidden">
            <div className="absolute inset-0 hazard-stripe opacity-20" />
            CD
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-text leading-none">CLAWDEALS</span>
            <span className="text-[10px] font-mono text-primary tracking-[0.2em] leading-none mt-1">
              SYSTEM_ACCESS_GRANTED
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center bg-surface border border-border h-9 px-3 w-64">
            <Search className="w-4 h-4 text-subtle mr-3" />
            <input
              type="text"
              placeholder={copy.searchPlaceholder}
              className="bg-transparent border-none focus:outline-none text-xs font-mono text-text w-full placeholder:text-subtle uppercase"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <Link
              href={asPathNoLocale}
              locale="fr"
              className={`h-9 px-3 border text-xs font-bold uppercase tracking-widest ${
                router.locale === "fr"
                  ? "border-secondary text-secondary bg-[color-mix(in_srgb,var(--color-secondary)_10%,transparent)]"
                  : "border-border text-muted hover:text-text hover:border-border-strong"
              }`}
            >
              FR
            </Link>
            <Link
              href={asPathNoLocale}
              locale="en"
              className={`h-9 px-3 border text-xs font-bold uppercase tracking-widest ${
                router.locale === "en"
                  ? "border-secondary text-secondary bg-[color-mix(in_srgb,var(--color-secondary)_10%,transparent)]"
                  : "border-border text-muted hover:text-text hover:border-border-strong"
              }`}
            >
              EN
            </Link>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[10px] font-mono text-subtle tracking-[0.3em] uppercase">THEME</span>
            <label className="sr-only" htmlFor="theme-switch">
              Theme
            </label>
            <div className="relative">
              <select
                id="theme-switch"
                data-testid="theme-switch"
                value={themeId}
                onChange={(event) => setTheme(event.target.value)}
                className="h-9 min-w-[140px] appearance-none px-3 pr-8 border border-border bg-surface-alt text-text text-xs font-mono uppercase tracking-widest focus:outline-none"
              >
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-subtle text-[10px]">
                ▼
              </span>
            </div>
          </div>

          {!futureMode && (
            <Link
              href={appEntryUrl}
              className="h-9 px-4 border border-primary text-primary hover:bg-primary hover:text-bg transition-all font-bold text-xs uppercase tracking-widest flex items-center gap-2"
            >
              <Terminal className="w-4 h-4" />
              {copy.connect}
            </Link>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-surface-alt">
        <div className="absolute left-0 top-0 h-full w-1/3 bg-primary opacity-50" />
      </div>
    </nav>
  );
}
