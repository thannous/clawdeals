import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { ShoppingBag, Zap, ChevronRight } from "lucide-react";
import { useTheme } from "../../theme/theme-context";
import { getPublicAppEntryHref } from "../../shared/urls";
import { resolveSupportedLocale } from "../../shared/i18n";
import Navbar from "../landing/Navbar";

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
    getHref: (localePrefix: string) => `${getPublicAppEntryHref(localePrefix)}/deals`,
  },
];

export default function MarketplaceHub() {
  const t = useTranslations("marketplace");
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  const { themeId, setTheme, themes } = useTheme();

  return (
    <div className="min-h-screen bg-bg">
      <Navbar themeId={themeId} setTheme={setTheme} themes={themes} />

      <main id="main-content" tabIndex={-1} className="pt-20 pb-16">
        {/* Header */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-12">
          <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-text">
            <span className="text-primary mr-2">/</span>
            {t("title")}
          </h1>
          <p className="text-sm font-mono text-muted mt-1">{t("subtitle")}</p>
        </div>

        {/* Cards */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {SECTIONS.map(({ key, Icon, color, textColor, hoverBg, ctaBg, getHref }) => (
              <Link
                key={key}
                href={getHref(localePrefix)}
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
