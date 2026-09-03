import React, { useRef, useState, useTransition } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Lock, Play, ShieldCheck, ShoppingBag, Zap } from "lucide-react";
import { useTheme } from "../theme/theme-context";
import { getPublicApiBaseUrl, getPublicAppEntryHref, joinUrl } from "../shared/urls";
import { localePrefixFor } from "../shared/seo";
import type { SupportedLocale } from "../shared/i18n";
import Faq from "./landing/Faq";
import { NavbarCurrent, NavbarFuture } from "./landing/Navbar";
import { SectionHeader } from "./landing/primitives";
import PlatformPillars from "./landing/PlatformPillars";
import Footer from "./Footer";
import LocalizedMarketContext from "./seo/LocalizedMarketContext";
import ThreeIdeasGrid from "./shared/ThreeIdeasGrid";

const DealsPhone = dynamic(() => import("./landing/DealsPhone"));
const MarketPhone = dynamic(() => import("./landing/MarketPhone"));

const TRUST_MARQUEE_KEYS = ["segment-01", "segment-02", "segment-03", "segment-04"] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JUDGE_DEMO_URL = "https://sandbox.clawdeals.com/webmcp-challenge";

function toStableStringEntries(values: readonly string[]) {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const nextCount = (seen.get(value) || 0) + 1;
    seen.set(value, nextCount);
    return { key: `${value}-${nextCount}`, value };
  });
}

function resolveLandingLocale(locale: string): SupportedLocale {
  return (locale === "fr" || locale === "es") ? locale : "en";
}

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

function HeroFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations("landing");
  const headlineCount = parseInt(t("hero.headlineCount"), 10);
  const headlines = Array.from({ length: headlineCount }, (_, i) => t(`hero.headline_${i}`));
  const keyedHeadlines = toStableStringEntries(headlines);

  return (
    <div className="relative pt-32 pb-16 px-6 border-b border-border bg-surface overflow-hidden" data-testid="hero-section">
      <div className="animate-scanline" />
      <div className="tech-grid absolute inset-0 opacity-30" />

      <div className="max-w-[1440px] mx-auto relative z-10 flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight mb-6 text-text text-shadow-glow">
          {keyedHeadlines.map((line) => (
            <span key={line.key} className="block">{line.value}</span>
          ))}
        </h1>
        <p className="text-base md:text-lg text-muted leading-relaxed mb-4 max-w-3xl">
          {t("hero.subheadline")}
        </p>
        <p className="font-mono text-xs text-subtle uppercase tracking-widest mb-8 max-w-2xl" data-testid="hero-audience">
          {t("hero.audience")}
        </p>

        {children}
      </div>
    </div>
  );
}

function HeroCurrent({ locale }: { locale: string }) {
  const t = useTranslations("landing");
  const resolvedLocale = resolveLandingLocale(locale);
  const localePrefix = localePrefixFor(resolvedLocale);
  const entryUrl = getPublicAppEntryHref(localePrefix);

  return (
    <HeroFrame>
      <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4 w-full sm:w-auto">
        <Link
          href={entryUrl}
          data-acquisition-cta="hero"
          className="w-full sm:w-auto text-center px-8 py-4 font-bold uppercase tracking-wider text-sm transition-colors clip-corner-top-right relative group overflow-hidden bg-primary text-bg hover:bg-text"
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {t("hero.cta")} <ChevronRight className="w-4 h-4" />
          </span>
        </Link>
        <Link
          href={`${localePrefix}/browse`}
          data-testid="hero-browse-cta"
          className="w-full sm:w-auto text-center px-8 py-4 font-bold uppercase tracking-wider text-sm transition-colors border border-secondary text-secondary hover:bg-secondary hover:text-bg"
        >
          <span className="flex items-center justify-center gap-2">
            {t("hero.exploreCta")} <ChevronRight className="w-4 h-4" />
          </span>
        </Link>
      </div>
      <a
        href={JUDGE_DEMO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-2 font-mono text-xs text-subtle underline-offset-4 hover:text-primary hover:underline"
        data-testid="hero-demo-link"
      >
        <Play className="w-3.5 h-3.5" aria-hidden="true" />
        {t("hero.demoCta")}
      </a>
    </HeroFrame>
  );
}

function CoreIdeas() {
  const t = useTranslations("landing");
  const items = [0, 1, 2].map((index) => ({
    title: t(`hero.ideas.item_${index}.title`),
    body: t(`hero.ideas.item_${index}.body`)
  }));

  return (
    <section data-testid="landing-core-ideas">
      <SectionHeader title={t("hero.ideas.title")} subtitle={t("hero.ideas.eyebrow")} />
      <ThreeIdeasGrid items={items} ariaLabel={t("hero.ideas.title")} />
    </section>
  );
}

function VisitorSteps() {
  const t = useTranslations("landing");
  const steps = [0, 1, 2].map((index) => ({
    title: t(`hero.steps.item_${index}.title`),
    body: t(`hero.steps.item_${index}.body`)
  }));

  return (
    <section data-testid="landing-visitor-steps">
      <SectionHeader title={t("hero.steps.title")} subtitle={t("hero.steps.eyebrow")} accentText="text-secondary" accentBg="bg-secondary" />
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((step, index) => (
          <li key={step.title} className="border border-border bg-surface p-5 flex items-start gap-4">
            <span className="shrink-0 w-8 h-8 border border-secondary/50 bg-secondary/5 text-secondary font-mono text-xs flex items-center justify-center">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h3 className="font-bold text-text">{step.title}</h3>
              <p className="mt-2 text-sm text-muted leading-6">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HeroFuture() {
  const t = useTranslations("landing");

  return (
    <HeroFrame>
      <ComingSoonBadge label={t("future.badge")} />
    </HeroFrame>
  );
}

type ShowcaseTab = "deals" | "marketplace";

type ShowcaseTabMeta = {
  key: ShowcaseTab;
  Icon: typeof Zap;
  colorClass: string;
  borderClass: string;
  accentBg: string;
};

const SHOWCASE_TABS: ShowcaseTabMeta[] = [
  { key: "marketplace", Icon: ShoppingBag, colorClass: "text-secondary", borderClass: "border-secondary", accentBg: "bg-secondary" },
  { key: "deals", Icon: Zap, colorClass: "text-primary", borderClass: "border-primary", accentBg: "bg-primary" }
];

type TabbedShowcaseActionMap = Record<ShowcaseTab, React.ReactNode>;

function TabbedShowcaseFrame({
  actionByTab,
  tabs = SHOWCASE_TABS
}: {
  actionByTab: TabbedShowcaseActionMap;
  tabs?: ShowcaseTabMeta[];
}) {
  const t = useTranslations("landing");
  const [active, setActive] = useState<ShowcaseTab>(tabs[0]?.key ?? "marketplace");
  const tabsRef = useRef<HTMLDivElement>(null);
  const singleTab = tabs.length === 1;

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
  const activeTab = tabs.find((tab) => tab.key === active) ?? SHOWCASE_TABS[0];
  const PhoneComponent = active === "deals" ? DealsPhone : MarketPhone;

  return (
    <div>
      {/* ValueProps as clickable cards (only when there is a choice to make) */}
      <div ref={tabsRef} className={singleTab ? "hidden" : "grid grid-cols-2 gap-4 md:gap-16 mb-4 md:mb-8 scroll-mt-20"}>
        {tabs.map(({ key, Icon, colorClass, borderClass, accentBg }) => {
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
            {singleTab ? (
              <p className={`font-mono text-xs ${activeTab.colorClass} tracking-widest uppercase mb-3`}>
                {heroData[active].subtitle}
              </p>
            ) : null}
            <h3 className="text-2xl font-bold text-text tracking-tight mb-6">{t(`showcase.${active}.title`)}</h3>
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
            {actionByTab[active]}
          </div>
          {/* The phone mock-up is decorative on a 390 px screen and costs a full screen of scroll. */}
          <div className="hidden lg:flex justify-center">
            <PhoneComponent />
          </div>
        </div>
      </div>
    </div>
  );
}

function TabbedShowcaseCurrent({ locale }: { locale: string }) {
  const t = useTranslations("landing");
  const resolvedLocale = resolveLandingLocale(locale);
  const localePrefix = localePrefixFor(resolvedLocale);
  const entryUrl = getPublicAppEntryHref(localePrefix);

  const actionByTab: TabbedShowcaseActionMap = {
    deals: (
      <Link
        href={entryUrl}
        data-acquisition-cta="showcase_deals"
        className="inline-flex px-6 py-3 font-bold uppercase tracking-wider text-sm bg-text text-bg hover:bg-primary hover:text-text transition-colors"
      >
        {t("showcase.deals.cta")}
      </Link>
    ),
    marketplace: (
      <Link
        href={`${localePrefix}/browse`}
        data-testid="showcase-browse-cta"
        className="inline-flex px-6 py-3 font-bold uppercase tracking-wider text-sm bg-text text-bg hover:bg-primary hover:text-text transition-colors"
      >
        {t("hero.exploreCta")}
      </Link>
    )
  };

  // The landing tells one story: the marketplace. The deal-feed showcase lives on
  // /browse/deals so the page does not restate the three ideas twice.
  return <TabbedShowcaseFrame actionByTab={actionByTab} tabs={SHOWCASE_TABS.filter((tab) => tab.key === "marketplace")} />;
}

function FinalCallToAction({ locale }: { locale: SupportedLocale }) {
  const t = useTranslations("landing");
  const localePrefix = localePrefixFor(locale);

  return (
    <section className="border border-border bg-surface p-8 text-center space-y-4" data-testid="landing-final-cta">
      <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-text">{t("hero.finalTitle")}</h2>
      <p className="text-sm text-muted max-w-2xl mx-auto">{t("hero.pricingNote")}</p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href={getPublicAppEntryHref(localePrefix)}
          data-acquisition-cta="landing_activation"
          className="inline-flex items-center gap-2 px-8 py-4 font-bold uppercase tracking-wider text-sm border border-primary bg-primary text-bg hover:bg-text hover:border-text transition-colors"
        >
          {t("hero.cta")}
          <ChevronRight className="w-4 h-4" />
        </Link>
        <Link
          href={`${localePrefix}/pricing`}
          className="font-mono text-xs text-subtle underline-offset-4 hover:text-primary hover:underline"
        >
          {t("hero.pricingLink")}
        </Link>
      </div>
    </section>
  );
}

function TabbedShowcaseFuture() {
  const t = useTranslations("landing");

  const actionByTab: TabbedShowcaseActionMap = {
    deals: <ComingSoonBadge label={t("future.badge")} />,
    marketplace: <ComingSoonBadge label={t("future.badge")} />
  };

  return <TabbedShowcaseFrame actionByTab={actionByTab} />;
}

type LandingProps = {
  locale?: string;
  buildTimeIso: string;
  appVersion: string;
  deploySha?: string;
  futureMode?: boolean;
};

type LandingMode = "current" | "future";

type LandingVariantProps = {
  locale: SupportedLocale;
  buildTimeIso: string;
  appVersion: string;
  deploySha?: string;
};

type LandingShellProps = LandingVariantProps & {
  mode: LandingMode;
  banner?: React.ReactNode;
  hero: React.ReactNode;
  showcase: React.ReactNode;
};

function FutureBanner() {
  const t = useTranslations("landing");

  return (
    <div className="bg-bg border-b border-border">
      <div className="max-w-[1440px] mx-auto px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-subtle">
          <span className="w-2 h-2 bg-primary animate-pulse" />
          {t("future.bannerTitle")}
        </div>
        <div className="text-xs font-mono text-muted">{t("future.bannerBody")}</div>
      </div>
    </div>
  );
}

function LandingShell({ mode, locale, buildTimeIso, appVersion, deploySha, banner, hero, showcase }: LandingShellProps) {
  const { themeId, setTheme, themes } = useTheme();
  const t = useTranslations("landing");
  const deployShaShort = typeof deploySha === "string" ? deploySha.slice(0, 7) : undefined;
  const NavbarVariant = mode === "future" ? NavbarFuture : NavbarCurrent;

  return (
    <div className="min-h-screen overflow-x-hidden">
      <NavbarVariant
        themeId={themeId}
        setTheme={setTheme}
        themes={themes}
      />

      <main id="main-content" tabIndex={-1} className="pb-32">
        {banner}

        {hero}

        {mode === "current" && locale !== "en" && (
          <div className="max-w-[1440px] mx-auto px-6 pt-12">
            <LocalizedMarketContext locale={locale} context="landing" />
          </div>
        )}

        {mode === "current" && (
          <div className="max-w-[1440px] mx-auto px-6 py-16 space-y-16">
            <CoreIdeas />
            <VisitorSteps />
          </div>
        )}

        <div className="bg-primary text-bg py-2 overflow-hidden border-y border-bg" aria-hidden="true">
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
                  <Lock size={14} /> {t("trust.auditableActions")}
                </span>
                <span className="opacity-30">{"///"}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="max-w-[1440px] mx-auto px-6 py-16 space-y-24">
          {showcase}

          <div className="hidden md:block">
            <PlatformPillars />
          </div>

          <Faq />

          {mode === "current" ? <FinalCallToAction locale={locale} /> : null}
        </div>
      </main>

      <Footer locale={locale}>
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
          <WaitlistForm locale={locale} compact source="footer" />
        </div>
      </Footer>
    </div>
  );
}

function LandingCurrentVariant(props: LandingVariantProps) {
  return (
    <LandingShell
      {...props}
      mode="current"
      hero={<HeroCurrent locale={props.locale} />}
      showcase={<TabbedShowcaseCurrent locale={props.locale} />}
    />
  );
}

function LandingFutureVariant(props: LandingVariantProps) {
  return (
    <LandingShell
      {...props}
      mode="future"
      banner={<FutureBanner />}
      hero={<HeroFuture />}
      showcase={<TabbedShowcaseFuture />}
    />
  );
}

export default function Landing({
  locale = "en",
  buildTimeIso,
  appVersion,
  deploySha,
  futureMode = false
}: LandingProps) {
  const resolvedLocale = resolveLandingLocale(locale);
  const mode: LandingMode = futureMode ? "future" : "current";
  const variantProps: LandingVariantProps = {
    locale: resolvedLocale,
    buildTimeIso,
    appVersion,
    ...(typeof deploySha === "string" ? { deploySha } : {})
  };

  if (mode === "future") {
    return <LandingFutureVariant {...variantProps} />;
  }

  return <LandingCurrentVariant {...variantProps} />;
}
