import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { ChevronDown, Settings, Terminal } from "lucide-react";
import { getPublicAppEntryHref } from "../../shared/urls";
import { getLocaleLabels } from "../../shared/seo";
import { resolveSupportedLocale, stripLocalePrefix } from "../../shared/i18n";
import MarketingLink from "../shared/MarketingLink";
import ShareButton from "./ShareButton";
import type { ThemeOption } from "./types";

type NavbarProps = {
  themeId: string;
  setTheme: (themeId: string) => void;
  themes: ThemeOption[];
  futureMode?: boolean;
  center?: React.ReactNode;
};

const LOCALES = getLocaleLabels();

function useDropdownDismiss(open: boolean, setOpen: React.Dispatch<React.SetStateAction<boolean>>, ref: React.RefObject<HTMLDivElement>) {
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
  }, [open, ref, setOpen]);
}

function themeShortLabel(label: string) {
  return (label.split(" ")[0] || label).toUpperCase();
}

export default function Navbar({ themeId, setTheme, themes, futureMode, center }: NavbarProps) {
  const router = useRouter();
  const t = useTranslations("landing");
  const locale = resolveSupportedLocale(router.locale);
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  const appEntryUrl = getPublicAppEntryHref(localePrefix);
  const asPathNoLocale = stripLocalePrefix(router.asPath || "/");

  const [langOpen, setLangOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);
  const mobileSettingsRef = useRef<HTMLDivElement>(null);
  useDropdownDismiss(langOpen, setLangOpen, langRef);
  useDropdownDismiss(themeOpen, setThemeOpen, themeRef);
  useDropdownDismiss(mobileSettingsOpen, setMobileSettingsOpen, mobileSettingsRef);
  const activeTheme = themes.find((t) => t.id === themeId);

  return (
    <header className="fixed top-0 w-full z-50">
      <nav className="bg-bg backdrop-blur-md border-b border-border h-16">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-full grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-6">
        <MarketingLink href={`${localePrefix}/`} className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-primary clip-corner-top-right flex items-center justify-center text-bg font-bold text-base sm:text-xl relative overflow-hidden">
            <div className="absolute inset-0 hazard-stripe opacity-20" />
            CD
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-base sm:text-xl font-bold tracking-tight text-text leading-none">CLAWDEALS</span>
            <span className="text-xs font-mono text-primary tracking-[0.2em] leading-none mt-1 hidden sm:block">
              MARKET_ACCESS_GRANTED
            </span>
          </div>
        </MarketingLink>

        <div className="flex justify-center min-w-0">{center}</div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language dropdown */}
          <div ref={langRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setLangOpen((p) => !p)}
              className="h-9 px-3 border border-border text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 text-secondary hover:border-border-strong transition-colors"
            >
              {(router.locale || "en").toUpperCase()}
              <ChevronDown className="w-3 h-3" />
            </button>
            {langOpen && (
              <div className="absolute right-0 top-full mt-2 bg-surface border border-border shadow-lg z-50 min-w-[100px]">
                {LOCALES.map((loc) => (
                  <MarketingLink
                    key={loc.code}
                    href={asPathNoLocale}
                    locale={loc.code}
                    onClick={() => setLangOpen(false)}
                    className={`block px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                      router.locale === loc.code
                        ? "text-secondary bg-secondary/10"
                        : "text-muted hover:text-text hover:bg-surface-alt"
                    }`}
                  >
                    {loc.label}
                  </MarketingLink>
                ))}
              </div>
            )}
          </div>

          {/* Theme dropdown */}
          <div ref={themeRef} className="relative hidden sm:block">
            <button
              type="button"
              data-testid="theme-switch"
              onClick={() => setThemeOpen((p) => !p)}
              className="h-9 px-3 border border-border text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 text-text hover:border-border-strong transition-colors"
            >
              <span suppressHydrationWarning>
                {activeTheme ? themeShortLabel(activeTheme.label) : "THEME"}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {themeOpen && (
              <div className="absolute right-0 top-full mt-2 bg-surface border border-border shadow-lg z-50 min-w-[160px]">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setTheme(t.id); setThemeOpen(false); }}
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

          {/* Mobile settings dropdown (language + theme) */}
          <div ref={mobileSettingsRef} className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setMobileSettingsOpen((p) => !p)}
              className="h-9 w-9 border border-primary flex items-center justify-center text-primary hover:bg-primary/10 hover:border-primary transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            {mobileSettingsOpen && (
              <div className="absolute right-0 top-full mt-2 bg-surface border border-border shadow-lg z-50 min-w-[160px]">
                <div className="px-3 py-2 text-[10px] font-mono text-subtle uppercase tracking-widest border-b border-border">
                  Language
                </div>
                {LOCALES.map((loc) => (
                  <MarketingLink
                    key={loc.code}
                    href={asPathNoLocale}
                    locale={loc.code}
                    onClick={() => setMobileSettingsOpen(false)}
                    className={`block px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                      router.locale === loc.code
                        ? "text-secondary bg-secondary/10"
                        : "text-muted hover:text-text hover:bg-surface-alt"
                    }`}
                  >
                    {loc.label}
                  </MarketingLink>
                ))}
                <div className="px-3 py-2 text-[10px] font-mono text-subtle uppercase tracking-widest border-b border-t border-border">
                  Theme
                </div>
                {themes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setTheme(t.id); setMobileSettingsOpen(false); }}
                    className={`block w-full text-left px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                      t.id === themeId
                        ? "text-secondary bg-secondary/10"
                        : "text-muted hover:text-text hover:bg-surface-alt"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                {!futureMode && (
                  <>
                    <div className="border-t border-border" />
                    <MarketingLink
                      href={appEntryUrl}
                      onClick={() => setMobileSettingsOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      {t("connect")}
                    </MarketingLink>
                  </>
                )}
              </div>
            )}
          </div>

          {!futureMode && (
            <MarketingLink
              href={appEntryUrl}
              className="hidden sm:flex h-9 px-4 border border-primary text-primary hover:bg-primary hover:text-bg transition-all font-bold text-xs uppercase tracking-widest items-center gap-2"
            >
              <Terminal className="w-4 h-4" />
              {t("connect")}
            </MarketingLink>
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
