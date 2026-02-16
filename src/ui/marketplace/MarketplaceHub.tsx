import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { ShoppingBag, Zap, ChevronRight, Globe } from "lucide-react";
import { useTheme } from "../../theme/theme-context";

import { resolveSupportedLocale } from "../../shared/i18n";
import { POPULAR_COUNTRIES, ALL_COUNTRIES, localizeCountries } from "../../shared/countries";
import Navbar from "../landing/Navbar";

const STORAGE_KEY = "clawdeals:country";

const SECTIONS = [
  {
    key: "listings" as const,
    Icon: ShoppingBag,
    color: "border-secondary",
    textColor: "text-secondary",
    hoverBg: "hover:bg-secondary/10",
    ctaBg: "bg-secondary text-bg hover:bg-secondary/80",
    getHref: (localePrefix: string) => `${localePrefix}/browse`,
  },
  {
    key: "deals" as const,
    Icon: Zap,
    color: "border-primary",
    textColor: "text-primary",
    hoverBg: "hover:bg-primary/10",
    ctaBg: "bg-primary text-bg hover:bg-primary/80",
    getHref: (localePrefix: string) => `${localePrefix}/browse/deals`,
  },
];

function appendCountry(href: string, country: string | null) {
  if (!country) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}country=${country}`;
}

export default function MarketplaceHub() {
  const t = useTranslations("marketplace");
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  const { themeId, setTheme, themes } = useTheme();

  const [country, setCountry] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [search, setSearch] = useState("");
  const moreRef = useRef<HTMLDivElement>(null);

  const localizedPopular = useMemo(() => localizeCountries(POPULAR_COUNTRIES, locale), [locale]);
  const localizedAll = useMemo(() => localizeCountries(ALL_COUNTRIES, locale), [locale]);

  // Sync from localStorage after hydration (legitimate external-store read)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { const s = localStorage.getItem(STORAGE_KEY); if (s) setCountry(s); } catch {} }, []);

  function selectCountry(code: string | null) {
    setCountry(code);
    setMoreOpen(false);
    setSearch("");
    try {
      if (code) localStorage.setItem(STORAGE_KEY, code);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [moreOpen]);

  const filtered = useMemo(() => {
    if (!search) return localizedAll;
    const q = search.toLowerCase();
    return localizedAll.filter(
      (c) => c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [search, localizedAll]);

  const chipBase = "px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap";
  const chipActive = "bg-text text-bg";
  const chipInactive = "border border-border text-muted hover:border-text hover:text-text";

  return (
    <div className="min-h-screen bg-bg">
      <Navbar themeId={themeId} setTheme={setTheme} themes={themes} />

      <main id="main-content" tabIndex={-1} className="pt-20 pb-16">
        {/* Header */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-8">
          <h1 data-testid="marketplace-heading" className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-text">
            <span className="text-primary mr-2">/</span>
            {t("title")}
          </h1>
          <p className="text-sm font-mono text-muted mt-1">{t("subtitle")}</p>
        </div>

        {/* Country selector */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-8" ref={moreRef}>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs text-subtle tracking-widest uppercase">
              {t("country.label")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Worldwide */}
            <button
              type="button"
              data-testid="country-chip-worldwide"
              onClick={() => selectCountry(null)}
              className={`${chipBase} ${country === null ? chipActive : chipInactive} flex items-center gap-1.5`}
            >
              <Globe className="w-3.5 h-3.5" />
              {t("country.worldwide")}
            </button>

            {/* Popular countries */}
            {localizedPopular.map((c) => (
              <button
                key={c.code}
                type="button"
                data-testid={`country-chip-${c.code}`}
                onClick={() => selectCountry(c.code)}
                className={`${chipBase} ${country === c.code ? chipActive : chipInactive}`}
              >
                {c.flag} {c.label}
              </button>
            ))}

            {/* More button */}
            <button
              type="button"
              data-testid="country-more-btn"
              onClick={() => setMoreOpen((p) => !p)}
              className={`${chipBase} ${chipInactive}`}
            >
              {t("country.more")}
            </button>
          </div>

          {/* More dropdown */}
          {moreOpen && (
            <div className="mt-3 border border-border bg-surface p-4 max-w-lg">
              <input
                type="text"
                data-testid="country-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("country.search")}
                className="w-full bg-bg border border-border px-3 py-2 text-sm font-mono text-text placeholder:text-subtle focus:outline-none focus:border-text mb-3"
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-60 overflow-y-auto">
                {filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    data-testid={`country-option-${c.code}`}
                    onClick={() => selectCountry(c.code)}
                    className={`text-left px-2 py-1.5 text-xs font-mono truncate transition-colors ${
                      country === c.code
                        ? "bg-text text-bg"
                        : "text-muted hover:text-text hover:bg-surface"
                    }`}
                  >
                    {c.flag} {c.label}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="col-span-full text-xs text-subtle font-mono py-2">
                    —
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Cards */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SECTIONS.map(({ key, Icon, color, textColor, hoverBg, ctaBg, getHref }) => (
              <Link
                key={key}
                data-testid={`marketplace-card-${key}`}
                href={appendCountry(getHref(localePrefix), country)}
                className={`group block border ${color} bg-surface p-8 transition-colors ${hoverBg}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon className={`w-5 h-5 ${textColor}`} />
                  <span className="font-mono text-xs text-subtle tracking-widest uppercase">
                    {t(`${key}.subtitle`)}
                  </span>
                </div>

                <h2 className={`text-2xl md:text-3xl font-bold uppercase tracking-tight ${textColor} mb-3`}>
                  {t(`${key}.title`)}
                </h2>

                <p className="text-sm text-muted font-mono mb-8 leading-relaxed">
                  {t(`${key}.description`)}
                </p>

                <span
                  className={`inline-flex items-center gap-2 px-6 py-3 font-bold uppercase tracking-wider text-sm transition-colors ${ctaBg}`}
                >
                  {t(`${key}.cta`)}
                  <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
