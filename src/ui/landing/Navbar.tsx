import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ChevronDown, Terminal } from "lucide-react";
import { getPublicAppEntryHref } from "../../shared/urls";
import ShareButton from "./ShareButton";
import type { ThemeOption } from "./types";

type NavbarProps = {
  copy: { connect: string };
  themeId: string;
  setTheme: (themeId: string) => void;
  themes: ThemeOption[];
  futureMode?: boolean;
  center?: React.ReactNode;
};

const LOCALES = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" }
] as const;

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return { open, setOpen, ref } as const;
}

function themeShortLabel(label: string) {
  return (label.split(" ")[0] || label).toUpperCase();
}

export default function Navbar({ copy, themeId, setTheme, themes, futureMode, center }: NavbarProps) {
  const router = useRouter();
  const localePrefix = router.locale === "fr" ? "/fr" : "";
  const appEntryUrl = getPublicAppEntryHref(localePrefix);
  const asPathNoLocale =
    (router.asPath || "/").replace(/^\/(fr|en)(?=\/|$)/, "") || "/";

  const lang = useDropdown();
  const theme = useDropdown();
  const activeTheme = themes.find((t) => t.id === themeId);

  return (
    <header className="fixed top-0 w-full z-50">
      <nav className="bg-bg backdrop-blur-md border-b border-border h-16">
        <div className="max-w-[1440px] mx-auto px-6 h-full grid grid-cols-[auto_1fr_auto] items-center gap-6">
        <Link href={`${localePrefix}/`} className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary clip-corner-top-right flex items-center justify-center text-bg font-bold text-xl relative overflow-hidden">
            <div className="absolute inset-0 hazard-stripe opacity-20" />
            CD
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-text leading-none">CLAWDEALS</span>
            <span className="text-xs font-mono text-primary tracking-[0.2em] leading-none mt-1">
              MARKET_ACCESS_GRANTED
            </span>
          </div>
        </Link>

        <div className="flex justify-center">{center}</div>

        <div className="flex items-center gap-3">
          {/* Language dropdown */}
          <div ref={lang.ref} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => lang.setOpen((p) => !p)}
              className="h-9 px-3 border border-border text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 text-secondary hover:border-border-strong transition-colors"
            >
              {(router.locale || "en").toUpperCase()}
              <ChevronDown className="w-3 h-3" />
            </button>
            {lang.open && (
              <div className="absolute right-0 top-full mt-2 bg-surface border border-border shadow-lg z-50 min-w-[100px]">
                {LOCALES.map((loc) => (
                  <Link
                    key={loc.code}
                    href={asPathNoLocale}
                    locale={loc.code}
                    onClick={() => lang.setOpen(false)}
                    className={`block px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                      router.locale === loc.code
                        ? "text-secondary bg-secondary/10"
                        : "text-muted hover:text-text hover:bg-surface-alt"
                    }`}
                  >
                    {loc.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Theme dropdown */}
          <div ref={theme.ref} className="relative hidden sm:block">
            <button
              type="button"
              data-testid="theme-switch"
              onClick={() => theme.setOpen((p) => !p)}
              className="h-9 px-3 border border-border text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 text-text hover:border-border-strong transition-colors"
            >
              {activeTheme ? themeShortLabel(activeTheme.label) : "THEME"}
              <ChevronDown className="w-3 h-3" />
            </button>
            {theme.open && (
              <div className="absolute right-0 top-full mt-2 bg-surface border border-border shadow-lg z-50 min-w-[160px]">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setTheme(t.id); theme.setOpen(false); }}
                    className={`block w-full text-left px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                      t.id === themeId
                        ? "text-secondary bg-secondary/10"
                        : "text-muted hover:text-text hover:bg-surface-alt"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ShareButton locale={router.locale || "en"} />

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

      <div className="absolute bottom-0 left-0 w-full h-px bg-surface-alt">
        <div className="absolute left-0 top-0 h-full w-1/3 bg-primary opacity-50" />
      </div>
      </nav>
    </header>
  );
}
