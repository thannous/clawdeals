import React, { useRef, useState, useTransition } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Lock, ShieldCheck, ShoppingBag, Zap } from "lucide-react";
import { useTheme } from "../theme/theme-context";
import { getPublicApiBaseUrl, getPublicAppEntryHref, getPublicAppEntryPath, getPublicAppUrl, joinUrl } from "../shared/urls";
import { localePrefixFor } from "../shared/seo";
import type { SupportedLocale } from "../shared/i18n";
import Faq from "./landing/Faq";
import HowItWorks from "./landing/HowItWorks";
import MissionSelect from "./landing/MissionSelect";
import Navbar from "./landing/Navbar";
import { SectionHeader } from "./landing/primitives";
import ExploreDemos from "./landing/ExploreDemos";
import PlatformPillars from "./landing/PlatformPillars";
import Footer from "./Footer";

const TerminalEmulator = dynamic(() => import("./landing/TerminalEmulator"));
const NpmCallout = dynamic(() => import("./landing/NpmCallout"));
const DealsPhone = dynamic(() => import("./landing/DealsPhone"));
const MarketPhone = dynamic(() => import("./landing/MarketPhone"));

const TRUST_MARQUEE_KEYS = [
  "segment-01",
  "segment-02",
  "segment-03",
  "segment-04",
  "segment-05",
  "segment-06",
  "segment-07",
  "segment-08",
  "segment-09",
  "segment-10"
] as const;


const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function WaitlistForm({
  locale,
  compact = false,
  source = "hero"
}: {
  locale: string;
  compact?: boolean;
  source?: "hero" | "footer";
}) {
  const t = useTranslations("landing");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isLoading = status === "loading" || isPending;
  const isSuccess = status === "success";
  const isError = status === "error";

  const helperText = isSuccess
    ? message || t("waitlist.success")
    : isError
      ? message || t("waitlist.error")
      : t("waitlist.helper");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;

    const normalized = email.trim().toLowerCase();
    if (!normalized || !EMAIL_REGEX.test(normalized)) {
      setStatus("error");
      setMessage(t("waitlist.invalid"));
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const apiBaseUrl = getPublicApiBaseUrl();
      const endpoint = apiBaseUrl ? joinUrl(apiBaseUrl, "/api/v1/watchlist-signups") : "/api/v1/watchlist-signups";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, locale, source })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        startTransition(() => {
          setStatus("error");
          setMessage(payload?.error?.message || t("waitlist.error"));
        });
        return;
      }

      const resultStatus = payload?.data?.status;
      if (resultStatus === "already_registered") {
        startTransition(() => {
          setStatus("success");
          setMessage(t("waitlist.already"));
        });
        return;
      }

      startTransition(() => {
        setStatus("success");
        setMessage(t("waitlist.success"));
      });
    } catch (error) {
      startTransition(() => {
        setStatus("error");
        setMessage(t("waitlist.error"));
      });
      void error;
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
  };

  const containerClasses = compact
    ? "border border-border bg-surface-alt p-4"
    : "border border-border bg-surface p-5";
  const formClasses = compact ? "flex flex-col sm:flex-row gap-3" : "flex flex-col sm:flex-row gap-4";
  const actionDisabled = isLoading || isSuccess;

  return (
    <div className={containerClasses} data-testid={`waitlist-${source}`}>
      <div className="font-mono text-xs uppercase tracking-widest text-subtle mb-3">{t("waitlist.title")}</div>
      <form onSubmit={handleSubmit} className={formClasses}>
        <div className="flex-1">
          <label className="sr-only" htmlFor={`waitlist-email-${source}`}>
            {t("waitlist.label")}
          </label>
          <input
            id={`waitlist-email-${source}`}
            type="email"
            value={email}
            onChange={handleChange}
            placeholder={t("waitlist.placeholder")}
            autoComplete="email"
            disabled={actionDisabled}
            className="w-full h-11 px-4 bg-bg border border-border text-text font-mono text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={actionDisabled}
          className={`h-11 px-6 font-bold uppercase tracking-wider text-xs border border-primary transition-colors ${
            actionDisabled
              ? "bg-surface-alt text-subtle cursor-not-allowed"
              : "bg-primary text-bg hover:bg-text hover:text-bg"
          }`}
        >
          {t("waitlist.cta")}
        </button>
      </form>
      <div
        className={`mt-2 text-xs font-mono ${isError ? "text-error" : isSuccess ? "text-success" : "text-subtle"}`}
        aria-live="polite"
      >
        {helperText}
      </div>
    </div>
  );
}

function ComingSoonBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-subtle border border-border bg-bg px-3 py-2 w-fit">
      <span className="w-2 h-2 bg-primary animate-pulse" />
      {label}
    </div>
  );
}

function HeroCtas({
  primary,
  secondary,
  primaryHref,
  futureMode,
  badge
}: {
  primary: string;
  secondary: string;
  primaryHref: string;
  futureMode: boolean;
  badge: string;
}) {
  if (futureMode) {
    return <ComingSoonBadge label={badge} />;
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href={primaryHref}
        className="px-6 py-3 font-bold uppercase tracking-wider text-sm transition-colors clip-corner-top-right relative group overflow-hidden bg-primary text-bg hover:bg-text"
      >
        <span className="relative z-10 flex items-center gap-2">
          {primary} <ChevronRight className="w-4 h-4" />
        </span>
      </Link>
      <button className="border border-border-strong text-muted px-6 py-3 font-mono text-xs uppercase tracking-wider hover:border-text hover:text-text transition-colors">
        {secondary}
      </button>
    </div>
  );
}

function Hero({
  futureMode,
  locale
}: {
  futureMode: boolean;
  locale: string;
}) {
  const t = useTranslations("landing");
  const resolvedLocale: SupportedLocale = (locale === "fr" || locale === "es") ? locale : "en";
  const localePrefix = localePrefixFor(resolvedLocale);
  const entryUrl = getPublicAppEntryHref(localePrefix);
  const headlineCount = parseInt(t("hero.headlineCount"), 10);
  const headlines = Array.from({ length: headlineCount }, (_, i) => t(`hero.headline_${i}`));

  return (
    <div className="relative pt-32 pb-16 px-6 border-b border-border bg-surface overflow-hidden" data-testid="hero-section">
      <div className="animate-scanline" />
      <div className="tech-grid absolute inset-0 opacity-30" />

      <div className="max-w-[1440px] mx-auto relative z-10 flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold uppercase leading-[0.9] tracking-tighter mb-6 text-text text-shadow-glow">
          {headlines.map((line, i) => (
            <span key={i} className="block">{line}</span>
          ))}
        </h1>
        <p className="text-sm md:text-base text-muted font-mono mb-8 max-w-4xl">
          {t("hero.subheadline")}
        </p>

        {futureMode ? (
          <ComingSoonBadge label={t("future.badge")} />
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href={entryUrl}
              className="px-8 py-4 font-bold uppercase tracking-wider text-sm transition-colors clip-corner-top-right relative group overflow-hidden bg-primary text-bg hover:bg-text"
            >
              <span className="relative z-10 flex items-center gap-2">
                {t("hero.cta")} <ChevronRight className="w-4 h-4" />
              </span>
            </Link>
            <Link
              href={`${localePrefix}/marketplace`}
              className="px-8 py-4 font-bold uppercase tracking-wider text-sm transition-colors border border-secondary text-secondary hover:bg-secondary hover:text-bg"
            >
              <span className="flex items-center gap-2">
                {t("hero.exploreCta")} <ChevronRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}

type ShowcaseTab = "deals" | "marketplace";

const SHOWCASE_TABS: { key: ShowcaseTab; Icon: typeof Zap; colorClass: string; borderClass: string; accentBg: string }[] = [
  { key: "marketplace", Icon: ShoppingBag, colorClass: "text-secondary", borderClass: "border-secondary", accentBg: "bg-secondary" },
  { key: "deals", Icon: Zap, colorClass: "text-primary", borderClass: "border-primary", accentBg: "bg-primary" }
];

function TabbedShowcase({
  futureMode,
  locale
}: {
  futureMode: boolean;
  locale: string;
}) {
  const t = useTranslations("landing");
  const [active, setActive] = useState<ShowcaseTab>("marketplace");
  const tabsRef = useRef<HTMLDivElement>(null);
  const resolvedLocale: SupportedLocale = (locale === "fr" || locale === "es") ? locale : "en";
  const localePrefix = localePrefixFor(resolvedLocale);
  const entryUrl = getPublicAppEntryHref(localePrefix);

  const handleTabClick = (key: ShowcaseTab) => {
    setActive(key);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const heroData: Record<ShowcaseTab, { subtitle: string; title: string; description: string }> = {
    deals: {
      subtitle: t("hero.deals.subtitle"),
      title: t("hero.deals.title"),
      description: t("hero.deals.description")
    },
    marketplace: {
      subtitle: t("hero.marketplace.subtitle"),
      title: t("hero.marketplace.title"),
      description: t("hero.marketplace.description")
    }
  };

  const bulletCount = parseInt(t(`showcase.${active}.bulletCount`), 10);
  const bullets = Array.from({ length: bulletCount }, (_, i) => t(`showcase.${active}.bullet_${i}`));

  const headerMap: Record<ShowcaseTab, { title: string; subtitle: string }> = {
    deals: { title: t("headers.deals.title"), subtitle: t("headers.deals.subtitle") },
    marketplace: { title: t("headers.marketplace.title"), subtitle: t("headers.marketplace.subtitle") }
  };

  const header = headerMap[active];
  const activeTab = SHOWCASE_TABS.find((tab) => tab.key === active)!;
  const PhoneComponent = active === "deals" ? DealsPhone : MarketPhone;

  return (
    <div>
      {/* ValueProps as clickable cards */}
      <div ref={tabsRef} className="grid grid-cols-2 gap-4 md:gap-16 mb-4 md:mb-8 scroll-mt-20">
        {SHOWCASE_TABS.map(({ key, Icon, colorClass, borderClass, accentBg }) => {
          const isActive = active === key;
          return (
            <div key={key} className="flex flex-col">
              <button
                type="button"
                onClick={() => handleTabClick(key)}
                className={`group/card relative text-left transition-opacity duration-300 cursor-pointer pb-3 md:pb-4 ${
                  isActive ? "opacity-100" : "opacity-40 hover:opacity-70"
                }`}
              >
                <div className="flex items-start gap-1.5 md:gap-2 mb-2 md:mb-3">
                  <Icon className={`w-4 h-4 md:w-5 md:h-5 shrink-0 mt-0.5 ${colorClass}`} />
                  <span className={`font-mono text-xs ${colorClass} tracking-widest uppercase leading-relaxed`}>
                    {heroData[key].subtitle}
                  </span>
                </div>
                <h2 className="text-xl md:text-5xl font-bold uppercase leading-[0.9] tracking-tighter mb-2 md:mb-4 text-text">
                  {heroData[key].title}
                </h2>
                <p className={`hidden md:block text-sm text-muted font-mono max-w-md border-l-2 ${borderClass} pl-4`}>
                  {heroData[key].description}
                </p>
                {/* Hover hint on inactive card -- desktop only */}
                {!isActive && (
                  <span className={`hidden md:flex absolute bottom-4 right-0 font-mono text-xs ${colorClass} tracking-widest uppercase opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 items-center gap-1.5`}>
                    <ChevronDown className="w-3 h-3" />
                    VOIR LA DEMO
                  </span>
                )}
                {/* Active bottom bar */}
                <div className={`absolute bottom-0 left-0 h-[2px] transition-all duration-300 ${
                  isActive ? `w-full ${accentBg}` : "w-0 bg-transparent"
                }`} />
              </button>
              {/* Chevron indicator under active card -- desktop only */}
              <div className={`hidden md:flex items-center gap-2 pt-3 transition-all duration-300 ${
                isActive ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none"
              }`}>
                <ChevronDown className={`w-3.5 h-3.5 ${colorClass} animate-bounce`} />
                <span className={`font-mono text-xs ${colorClass} tracking-widest uppercase`}>SHOWCASE</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active showcase */}
      <div key={active} className="showcase-enter">
        <SectionHeader title={header.title} subtitle={header.subtitle} accentText={activeTab.colorClass} accentBg={activeTab.accentBg} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h3 className="text-2xl font-bold text-text uppercase tracking-wide mb-6">{t(`showcase.${active}.title`)}</h3>
            <ul className="space-y-3 mb-8">
              {bullets.map((bullet, index) => (
                <li key={bullet} className="flex items-start gap-3">
                  <span className={`w-5 h-5 border ${activeTab.borderClass} flex items-center justify-center text-xs font-mono ${activeTab.colorClass} flex-shrink-0 mt-0.5`}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-muted font-mono">{bullet}</span>
                </li>
              ))}
            </ul>
            {futureMode ? (
              <ComingSoonBadge label={t("future.badge")} />
            ) : (
              <Link
                href={entryUrl}
                className="inline-flex px-6 py-3 font-bold uppercase tracking-wider text-sm bg-text text-bg hover:bg-primary hover:text-text transition-colors"
              >
                {t(`showcase.${active}.cta`)}
              </Link>
            )}
          </div>
          <div className="flex justify-center">
            <PhoneComponent />
          </div>
        </div>
      </div>
    </div>
  );
}

function DeveloperSection() {
  const t = useTranslations("landing");
  return (
    <div className="max-w-7xl mx-auto">
      <SectionHeader title={t("headers.developer.title")} subtitle={t("headers.developer.subtitle")} />
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "560px" }}>
        <TerminalEmulator />
      </div>
      <div className="mt-12" style={{ contentVisibility: "auto", containIntrinsicSize: "520px" }}>
        <NpmCallout />
      </div>
    </div>
  );
}

type LandingProps = {
  locale?: string;
  buildTimeIso: string;
  appVersion: string;
  deploySha?: string;
  futureMode?: boolean;
};

export default function Landing({
  locale = "en",
  buildTimeIso,
  appVersion,
  deploySha,
  futureMode = false
}: LandingProps) {
  const { themeId, setTheme, themes } = useTheme();
  const t = useTranslations("landing");
  const resolvedLocale: SupportedLocale = (locale === "fr" || locale === "es") ? locale : "en";
  const deployShaShort = typeof deploySha === "string" ? deploySha.slice(0, 7) : undefined;

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Navbar
        themeId={themeId}
        setTheme={setTheme}
        themes={themes}
        futureMode={futureMode}
      />

      <main id="main-content" tabIndex={-1} className="pb-32">
        {futureMode && (
          <div className="bg-bg border-b border-border">
            <div className="max-w-[1440px] mx-auto px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-subtle">
                <span className="w-2 h-2 bg-primary animate-pulse" />
                {t("future.bannerTitle")}
              </div>
              <div className="text-xs font-mono text-muted">{t("future.bannerBody")}</div>
            </div>
          </div>
        )}

        <Hero futureMode={futureMode} locale={resolvedLocale} />

        <div className="bg-primary text-bg py-2 overflow-hidden border-y border-bg">
          <div
            className="flex whitespace-nowrap gap-12 font-mono text-xs font-bold uppercase tracking-widest"
            style={{ animation: "marquee 20s linear infinite" }}
          >
            {TRUST_MARQUEE_KEYS.map((segmentKey) => (
              <React.Fragment key={segmentKey}>
                <span className="flex items-center gap-2">
                  <ShieldCheck size={14} /> {t("trust.verified")}
                </span>
                <span className="opacity-30">{"///"}</span>
                <span className="flex items-center gap-2">
                  <Lock size={14} /> {t("trust.escrow")}
                </span>
                <span className="opacity-30">{"///"}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="max-w-[1440px] mx-auto px-6 py-16 space-y-24">
          <TabbedShowcase futureMode={futureMode} locale={resolvedLocale} />

          <HowItWorks />

          <MissionSelect />

          <PlatformPillars />

          <DeveloperSection />

          <ExploreDemos />

          <Faq />
        </div>
      </main>

      <Footer locale={resolvedLocale}>
        <div className="mt-4 leading-relaxed">
          {t("footer.serverTime")}: <span suppressHydrationWarning>{buildTimeIso}</span>
          <br />
          VERSION: <span>v{appVersion}</span>
          {deployShaShort ? (
            <>
              <br />
              DEPLOY: <span title={deploySha}>{deployShaShort}</span>
            </>
          ) : null}
        </div>
        <div className="mt-6 max-w-md">
          <WaitlistForm locale={resolvedLocale} compact source="footer" />
        </div>
      </Footer>
    </div>
  );
}
