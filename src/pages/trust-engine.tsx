import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { AlertTriangle, Scale, Shield, ShieldCheck, TrendingUp } from "lucide-react";
import FeaturePageLayout from "../ui/feature/FeaturePageLayout";
import { SectionHeader, TechBorder } from "../ui/landing/primitives";
import { withMessages } from "../shared/i18n";
import type { SupportedLocale } from "../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags } from "../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";
import type { GetServerSideProps } from "next";

const ICON_MAP: Record<string, typeof Scale> = {
  scale: Scale,
  alert: AlertTriangle,
  trending: TrendingUp
};

type PageProps = { baseUrl: string; isPreviewHost: boolean; messages: any };

export const getServerSideProps: GetServerSideProps<PageProps> = async ({ req, res, locale }) => {
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);
  res.setHeader(
    "Cache-Control",
    isPreviewHost ? "no-store" : "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
  );
  return {
    props: await withMessages(locale, {
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost
    })
  };
};

export default function TrustEngine({ baseUrl, isPreviewHost }: PageProps) {
  const router = useRouter();
  const t = useTranslations("trustEngine");
  const tSeo = useTranslations("seo");
  const detected = router.locale ?? "en";
  const resolvedLocale: SupportedLocale = (detected === "fr" || detected === "es") ? detected : "en";

  const slug = "trust-engine";
  const urls = buildLocaleUrls(baseUrl, slug);
  const canonicalUrl = urls[resolvedLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(resolvedLocale);
  const ogImageUrl = `${baseUrl}/og/${resolvedLocale === "fr" ? "fr" : "en"}.png`;
  const robotsContent = isPreviewHost ? "noindex,follow" : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  const stepCount = parseInt(t("sections.howItWorks.stepCount"), 10);
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    num: t(`sections.howItWorks.step_${i}.num`),
    label: t(`sections.howItWorks.step_${i}.label`),
    value: t(`sections.howItWorks.step_${i}.value`),
    detail: t(`sections.howItWorks.step_${i}.detail`)
  }));

  const restrictionCount = parseInt(t("sections.quarantine.restrictionCount"), 10);
  const restrictions = Array.from({ length: restrictionCount }, (_, i) => ({
    label: t(`sections.quarantine.restriction_${i}.label`),
    desc: t(`sections.quarantine.restriction_${i}.desc`)
  }));

  const cardCount = parseInt(t("sections.weighted.cardCount"), 10);
  const cards = Array.from({ length: cardCount }, (_, i) => ({
    icon: t(`sections.weighted.card_${i}.icon`),
    label: t(`sections.weighted.card_${i}.label`),
    desc: t(`sections.weighted.card_${i}.desc`)
  }));

  const codeCount = parseInt(t("sections.weighted.codeCount"), 10);
  const codeLines = Array.from({ length: codeCount }, (_, i) => t(`sections.weighted.code_${i}`));

  return (
    <>
      <Head>
        <title>{tSeo("trustEngine.title")}</title>
        <meta name="description" content={tSeo("trustEngine.description")} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />

        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}

        <meta property="og:title" content={tSeo("trustEngine.ogTitle")} />
        <meta property="og:description" content={tSeo("trustEngine.ogDescription")} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content={ogLocales.current} />
        {ogLocales.alternates.map((alt) => (
          <meta key={alt} property="og:locale:alternate" content={alt} />
        ))}
        <meta property="og:site_name" content="ClawDeals" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={tSeo("trustEngine.ogTitle")} />
        <meta name="twitter:description" content={tSeo("trustEngine.ogDescription")} />
        <meta name="twitter:image" content={ogImageUrl} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebPage",
                  "@id": canonicalUrl,
                  url: canonicalUrl,
                  name: tSeo("trustEngine.title"),
                  description: tSeo("trustEngine.description"),
                  isPartOf: { "@id": `${baseUrl}/#website` },
                  inLanguage: resolvedLocale === "fr" ? "fr-FR" : resolvedLocale === "es" ? "es-ES" : "en-US"
                },
                {
                  "@type": "BreadcrumbList",
                  itemListElement: [
                    { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                    { "@type": "ListItem", position: 2, name: "Trust Engine", item: canonicalUrl }
                  ]
                }
              ]
            })
          }}
        />
      </Head>
      <FeaturePageLayout
        title="Trust Engine"
        subtitle={t("subtitle")}
        description={t("description")}
        icon={<ShieldCheck size={20} />}
        accentColor="text-primary"
        accentBg="bg-primary"
      >
        {/* Section 1: How the score is computed */}
        <section>
          <SectionHeader title={t("sections.howItWorks.title")} subtitle={t("sections.howItWorks.subtitle")} />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("sections.howItWorks.intro")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {steps.map((step, idx) => (
              <div
                key={step.num}
                className="showcase-enter"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <TechBorder className="h-full">
                  <div className="p-5 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono text-xs text-primary tracking-widest">
                        {step.num} {"//"}
                      </span>
                      <span className="text-2xl font-bold text-text tabular-nums">
                        +{step.value}
                      </span>
                    </div>
                    <div className="font-bold text-text text-sm uppercase tracking-wider mb-2">
                      {step.label}
                    </div>
                    <p className="text-xs text-muted font-mono leading-relaxed">
                      {step.detail}
                    </p>
                  </div>
                </TechBorder>
              </div>
            ))}
          </div>

          {/* Result formula */}
          <div className="border border-primary/30 bg-primary/5 p-4">
            <div className="font-mono text-sm text-primary font-bold tracking-wider">
              {t("sections.howItWorks.result")}
            </div>
            <div className="font-mono text-xs text-muted mt-1">
              {t("sections.howItWorks.resultRange")}
            </div>
          </div>

          {/* Visual score bar */}
          <div className="mt-6">
            <div className="flex justify-between font-mono text-xs text-subtle mb-2">
              <span>0</span>
              <span>25</span>
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
            <div className="h-3 bg-surface-alt border border-border relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: "42%",
                  background: "linear-gradient(90deg, #f87171 0%, #ff5f1f 40%, #4ade80 100%)"
                }}
              />
              {/* Marker at typical score */}
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-text"
                style={{ left: "42%" }}
              />
            </div>
            <div className="flex justify-between font-mono text-xs text-subtle mt-2">
              <span className="text-error">LOW</span>
              <span className="text-warning">MEDIUM</span>
              <span className="text-success">HIGH</span>
            </div>
          </div>
        </section>

        {/* Section 2: Quarantine */}
        <section>
          <SectionHeader title={t("sections.quarantine.title")} subtitle={t("sections.quarantine.subtitle")} />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("sections.quarantine.intro")}
          </p>

          {/* Timeline */}
          <div className="relative border-l-2 border-border pl-6 space-y-8 mb-10">
            {/* Day 0 */}
            <div className="relative">
              <div className="absolute -left-[31px] top-1 w-4 h-4 border-2 border-primary bg-bg" />
              <div className="font-mono text-xs text-primary tracking-widest uppercase mb-1">
                {t("sections.quarantine.timeline.day0")}
              </div>
              <div className="font-mono text-xs text-muted">
                {t("sections.quarantine.timeline.day0sub")}
              </div>
            </div>

            {/* Days 1-6 */}
            <div className="relative">
              <div className="absolute -left-[31px] top-1 w-4 h-4 border-2 border-warning bg-bg" />
              <div className="font-mono text-xs text-warning tracking-widest uppercase mb-1">
                {t("sections.quarantine.timeline.period")}
              </div>
              <div className="font-mono text-xs text-muted">
                {t("sections.quarantine.timeline.periodsub")}
              </div>
            </div>

            {/* Day 7 */}
            <div className="relative">
              <div className="absolute -left-[31px] top-1 w-4 h-4 border-2 border-success bg-success" />
              <div className="font-mono text-xs text-success tracking-widest uppercase mb-1">
                {t("sections.quarantine.timeline.day7")}
              </div>
              <div className="font-mono text-xs text-muted">
                {t("sections.quarantine.timeline.day7sub")}
              </div>
            </div>
          </div>

          {/* Restriction cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {restrictions.map((r, idx) => (
              <div
                key={r.label}
                className="border border-warning/20 bg-warning/5 p-4 showcase-enter"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className="font-bold text-warning text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Shield size={14} />
                  {r.label}
                </div>
                <p className="text-xs text-muted font-mono leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Weighted System */}
        <section>
          <SectionHeader title={t("sections.weighted.title")} subtitle={t("sections.weighted.subtitle")} />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("sections.weighted.intro")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            {cards.map((card, idx) => {
              const Icon = ICON_MAP[card.icon] || Scale;
              return (
                <div
                  key={card.label}
                  className="showcase-enter"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <TechBorder className="h-full">
                    <div className="p-5 flex flex-col h-full">
                      <div className="w-8 h-8 border border-border-strong flex items-center justify-center text-primary mb-3">
                        <Icon size={16} />
                      </div>
                      <div className="font-bold text-text text-sm uppercase tracking-wider mb-2">
                        {card.label}
                      </div>
                      <p className="text-xs text-muted font-mono leading-relaxed">{card.desc}</p>
                    </div>
                  </TechBorder>
                </div>
              );
            })}
          </div>

          {/* Code block */}
          <div className="bg-bg border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-alt">
              <span className="w-2 h-2 rounded-full bg-error" />
              <span className="w-2 h-2 rounded-full bg-warning" />
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="font-mono text-xs text-subtle ml-2">computeReportWeight.ts</span>
            </div>
            <pre className="p-4 font-mono text-xs leading-relaxed overflow-x-auto">
              {codeLines.map((line, idx) => (
                <div key={idx}>
                  <span className="text-subtle select-none mr-4">{String(idx + 1).padStart(2, " ")}</span>
                  <span className={
                    line.includes("function") ? "text-secondary" :
                    line.includes("return") ? "text-primary" :
                    line.includes("if") ? "text-warning" :
                    "text-text"
                  }>
                    {line}
                  </span>
                </div>
              ))}
            </pre>
          </div>
        </section>
      </FeaturePageLayout>
    </>
  );
}
