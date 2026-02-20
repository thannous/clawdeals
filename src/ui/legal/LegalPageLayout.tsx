import React from "react";
import { useRouter } from "next/router";
import { useTheme } from "../../theme/theme-context";
import { NavbarCurrent } from "../landing/Navbar";
import Footer from "../Footer";
import type { SupportedLocale } from "../../shared/i18n";

type LegalPageLayoutProps = {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
};

export default function LegalPageLayout({
  title,
  lastUpdated,
  children
}: LegalPageLayoutProps) {
  const router = useRouter();
  const { themeId, setTheme, themes } = useTheme();
  const detected = router.locale ?? "en";
  const locale: SupportedLocale = (detected === "fr" || detected === "es") ? detected : "en";

  return (
    <div className="min-h-screen bg-bg text-text">
      <NavbarCurrent
        themeId={themeId}
        setTheme={setTheme}
        themes={themes}
      />

      {/* Hero */}
      <div className="pt-28 pb-12 px-6 border-b border-border bg-surface">
        <div className="max-w-[760px] mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-tighter text-text mb-4">
            {title}
          </h1>
          <p className="font-mono text-xs text-subtle">
            {locale === "fr"
              ? `Dernière mise à jour : ${lastUpdated}`
              : locale === "es"
                ? `Última actualización: ${lastUpdated}`
                : `Last updated: ${lastUpdated}`}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[760px] mx-auto px-6 py-12">
        <div className="legal-prose font-mono text-sm text-muted leading-relaxed space-y-8">
          {children}
        </div>
      </div>

      <Footer locale={locale} />
    </div>
  );
}
