import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useTheme } from "../../theme/theme-context";
import { getPublicAppEntryHref } from "../../shared/urls";
import { localePrefixFor } from "../../shared/seo";
import type { SupportedLocale } from "../../shared/i18n";
import Navbar from "../landing/Navbar";

type FeaturePageLayoutProps = {
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string;
  accentBg: string;
  children: React.ReactNode;
};

export default function FeaturePageLayout({
  title,
  subtitle,
  description,
  icon,
  accentColor,
  accentBg,
  children
}: FeaturePageLayoutProps) {
  const router = useRouter();
  const { themeId, setTheme, themes } = useTheme();
  const t = useTranslations("seo");
  const detected = router.locale ?? "en";
  const locale: SupportedLocale = (detected === "fr" || detected === "es") ? detected : "en";
  const localePrefix = localePrefixFor(locale);
  // `router.pathname` is stable across locales and ignores query/hash.
  const activePath = router.pathname;

  return (
    <div className="min-h-screen bg-bg text-text">
      <Navbar
        themeId={themeId}
        setTheme={setTheme}
        themes={themes}
        futureMode={false}
      />

      {/* Hero */}
      <div className="relative pt-28 pb-16 px-6 border-b border-border bg-surface overflow-hidden">
        <div className="animate-scanline" />
        <div className="tech-grid absolute inset-0 opacity-30" />

        <div className="max-w-[960px] mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-10 h-10 border border-border-strong bg-surface-alt/50 flex items-center justify-center ${accentColor}`}>
              {icon}
            </div>
            <span className={`font-mono text-xs ${accentColor} tracking-widest uppercase`}>
              {subtitle}
            </span>
          </div>

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold uppercase leading-[0.9] tracking-tighter text-text text-shadow-glow mb-6">
            {title}
          </h1>

          <p className="text-sm md:text-base text-muted font-mono max-w-2xl leading-relaxed">
            {description}
          </p>

          {/* Accent line */}
          <div className={`mt-8 h-[2px] w-24 ${accentBg}`} />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[960px] mx-auto px-6 py-16 space-y-20">
        {children}
      </div>

      {/* Connect CTA */}
      <div className="border-t border-border bg-bg">
        <div className="max-w-[960px] mx-auto px-6 py-16 flex flex-col items-center text-center">
          <div className="font-mono text-xs text-subtle tracking-widest uppercase mb-4">
            {t("featureLayout.readyToStart")}
          </div>
          <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight text-text mb-3">
            {t("featureLayout.ctaHeadline")}
          </h2>
          <p className="text-sm text-muted font-mono max-w-lg mb-8">
            {t("featureLayout.ctaBody")}
          </p>
          <Link
            href={getPublicAppEntryHref(localePrefix)}
            className="px-8 py-3 font-bold uppercase tracking-wider text-sm border border-primary bg-primary text-bg hover:bg-text hover:border-text transition-colors"
          >
            {t("featureLayout.ctaButton")}
          </Link>
        </div>
      </div>

      {/* Footer nav */}
      <div className="border-t border-border bg-surface">
        <div className="max-w-[960px] mx-auto px-6 py-16 flex flex-col items-center text-center">
          <div className="font-mono text-xs text-subtle tracking-widest uppercase mb-4">
            {t("featureLayout.explorePlatform")}
          </div>
          <div className="flex flex-wrap gap-3 justify-center mb-6">
            <Link
              href="/"
              className="px-6 py-3 font-bold uppercase tracking-wider text-xs border border-border-strong text-muted hover:border-text hover:text-text transition-colors bg-bg"
            >
              Home
            </Link>
            <Link
              href="/trust-engine"
              className={`px-6 py-3 font-bold uppercase tracking-wider text-xs border transition-colors ${
                activePath === "/trust-engine"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted hover:border-primary hover:text-primary"
              }`}
            >
              Trust Engine
            </Link>
            <Link
              href="/policy-control"
              className={`px-6 py-3 font-bold uppercase tracking-wider text-xs border transition-colors ${
                activePath === "/policy-control"
                  ? "border-secondary bg-secondary/10 text-secondary"
                  : "border-border text-muted hover:border-secondary hover:text-secondary"
              }`}
            >
              Policy Control
            </Link>
            <Link
              href="/audit-trail"
              className={`px-6 py-3 font-bold uppercase tracking-wider text-xs border transition-colors ${
                activePath === "/audit-trail"
                  ? "border-success bg-success/10 text-success"
                  : "border-border text-muted hover:border-success hover:text-success"
              }`}
            >
              Audit Trail
            </Link>
          </div>
          <div className="font-mono text-xs text-subtle tracking-widest uppercase mb-4">
            {t("featureLayout.integrationsGuides")}
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/integrations/openclaw"
              className={`px-6 py-3 font-bold uppercase tracking-wider text-xs border transition-colors ${
                activePath === "/integrations/openclaw"
                  ? "border-secondary bg-secondary/10 text-secondary"
                  : "border-border text-muted hover:border-secondary hover:text-secondary"
              }`}
            >
              OpenClaw
            </Link>
            <Link
              href="/guides/openclaw-dealwatch"
              className={`px-6 py-3 font-bold uppercase tracking-wider text-xs border transition-colors ${
                activePath === "/guides/openclaw-dealwatch"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted hover:border-primary hover:text-primary"
              }`}
            >
              DealWatch
            </Link>
            <Link
              href="/guides/mcp-marketplace-safety"
              className={`px-6 py-3 font-bold uppercase tracking-wider text-xs border transition-colors ${
                activePath === "/guides/mcp-marketplace-safety"
                  ? "border-success bg-success/10 text-success"
                  : "border-border text-muted hover:border-success hover:text-success"
              }`}
            >
              MCP Safety
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
