import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { ShoppingBag, Zap, ChevronRight } from "lucide-react";
import { useTheme } from "../../theme/theme-context";

import { resolveSupportedLocale } from "../../shared/i18n";
import {
  LAUNCH_MARKETS,
  normalizeMarketCode,
  type LaunchMarketCode
} from "../../shared/markets";
import { flagEmoji } from "../../shared/countries";
import { NavbarCurrent } from "../landing/Navbar";
import LocalizedMarketContext from "../seo/LocalizedMarketContext";

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

  const [country, setCountry] = useState<LaunchMarketCode | null>(null);

  // Sync from localStorage after hydration (legitimate external-store read)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const supportedMarket = normalizeMarketCode(stored);
      if (supportedMarket) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCountry(supportedMarket);
      } else if (stored) {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }, []);

  function selectCountry(code: LaunchMarketCode | null) {
    setCountry(code);
    try {
      if (code) localStorage.setItem(STORAGE_KEY, code);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  const chipBase = "px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap";
  const chipActive = "bg-text text-bg";
  const chipInactive = "border border-border text-muted hover:border-text hover:text-text";

  return (
    <div className="min-h-screen bg-bg">
      <NavbarCurrent themeId={themeId} setTheme={setTheme} themes={themes} />

      <main id="main-content" tabIndex={-1} className="pt-20 pb-16">
        {/* Header */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-8">
          <h1 data-testid="marketplace-heading" className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-text">
            <span className="text-primary mr-2">/</span>
            {t("title")}
          </h1>
          <p className="text-sm font-mono text-muted mt-1">{t("subtitle")}</p>
        </div>

        {locale !== "en" && (
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-8">
            <LocalizedMarketContext locale={locale} context="marketplace" />
          </div>
        )}

        {/* Country selector */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs text-subtle tracking-widest uppercase">
              {t("country.label")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="country-chip-all"
              aria-pressed={country === null}
              onClick={() => selectCountry(null)}
              className={`${chipBase} ${country === null ? chipActive : chipInactive}`}
            >
              {t("country.all")}
            </button>

            {LAUNCH_MARKETS.map((market) => (
              <button
                key={market.code}
                type="button"
                data-testid={`country-chip-${market.code}`}
                aria-pressed={country === market.code}
                onClick={() => selectCountry(market.code)}
                className={`${chipBase} ${country === market.code ? chipActive : chipInactive}`}
              >
                {flagEmoji(market.code)} {market.code} · {market.currency}
              </button>
            ))}
          </div>
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
