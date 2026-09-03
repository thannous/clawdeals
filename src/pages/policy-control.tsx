import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { Ban, ChevronRight, Clock, DollarSign, ListChecks, Lock, Settings, ShieldAlert, UserCheck } from "lucide-react";
import FeaturePageLayout from "../ui/feature/FeaturePageLayout";
import LocalizedMarketContext from "../ui/seo/LocalizedMarketContext";
import { SectionHeader, TechBorder } from "../ui/landing/primitives";
import { withMessages } from "../shared/i18n";
import type { SupportedLocale } from "../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";
import type { GetServerSideProps } from "next";
import PolicyEditorLink from "../ui/settings/PolicyEditorLink";

const RULE_ICONS: Record<string, typeof Lock> = {
  dollar: DollarSign,
  check: ListChecks,
  clock: Clock,
  ban: Ban,
  shield: ShieldAlert,
  settings: Settings,
  user: UserCheck
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

export default function PolicyControl({ baseUrl, isPreviewHost }: PageProps) {
  const router = useRouter();
  const t = useTranslations("policyControl");
  const tSeo = useTranslations("seo");
  const detected = router.locale ?? "en";
  const resolvedLocale: SupportedLocale = (detected === "fr" || detected === "es") ? detected : "en";

  const slug = "policy-control";
  const urls = buildLocaleUrls(baseUrl, slug);
  const canonicalUrl = urls[resolvedLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(resolvedLocale);
  const ogImageUrl = `${baseUrl}/og/${resolvedLocale}.png`;
  const robotsContent = isPreviewHost ? "noindex,follow" : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  const ruleCardCount = parseInt(t("sections.rules.cardCount"), 10);
  const ruleCards = Array.from({ length: ruleCardCount }, (_, i) => ({
    icon: t(`sections.rules.card_${i}.icon`),
    label: t(`sections.rules.card_${i}.label`),
    desc: t(`sections.rules.card_${i}.desc`),
    example: t(`sections.rules.card_${i}.example`)
  }));

  const pipelineStepCount = parseInt(t("sections.pipeline.stepCount"), 10);
  const pipelineSteps = Array.from({ length: pipelineStepCount }, (_, i) => ({
    num: t(`sections.pipeline.step_${i}.num`),
    label: t(`sections.pipeline.step_${i}.label`),
    desc: t(`sections.pipeline.step_${i}.desc`),
    status: t(`sections.pipeline.step_${i}.status`)
  }));

  const outcomeCount = parseInt(t("sections.pipeline.outcomeCount"), 10);
  const outcomes = Array.from({ length: outcomeCount }, (_, i) => ({
    label: t(`sections.pipeline.outcome_${i}.label`),
    desc: t(`sections.pipeline.outcome_${i}.desc`),
    color: t(`sections.pipeline.outcome_${i}.color`),
    bg: t(`sections.pipeline.outcome_${i}.bg`)
  }));

  const ownerCardCount = parseInt(t("sections.owner.cardCount"), 10);
  const ownerCards = Array.from({ length: ownerCardCount }, (_, i) => ({
    icon: t(`sections.owner.card_${i}.icon`),
    label: t(`sections.owner.card_${i}.label`),
    desc: t(`sections.owner.card_${i}.desc`)
  }));

  return (
    <>
      <Head>
        <title>{tSeo("policyControl.title")}</title>
        <meta name="description" content={normalizeMetaDescription(tSeo("policyControl.description"))} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />

        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}

        <meta property="og:title" content={tSeo("policyControl.ogTitle")} />
        <meta property="og:description" content={tSeo("policyControl.ogDescription")} />
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
        <meta name="twitter:title" content={tSeo("policyControl.ogTitle")} />
        <meta name="twitter:description" content={tSeo("policyControl.ogDescription")} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      <Script id="policy-control-json-ld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": canonicalUrl,
              url: canonicalUrl,
              name: tSeo("policyControl.title"),
              description: tSeo("policyControl.description"),
              isPartOf: { "@id": `${baseUrl}/#website` },
              inLanguage: resolvedLocale === "fr" ? "fr-FR" : resolvedLocale === "es" ? "es-ES" : "en-US"
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                { "@type": "ListItem", position: 2, name: t("breadcrumb"), item: canonicalUrl }
              ]
            }
          ]
        }).replace(/</g, "\\u003c")}
      </Script>
      <FeaturePageLayout
        title="Policy Control"
        subtitle={t("subtitle")}
        description={t("description")}
        icon={<Lock size={20} />}
        accentColor="text-secondary"
        accentBg="bg-secondary"
      >
        <PolicyEditorLink />

        <LocalizedMarketContext locale={resolvedLocale} context="policy" />

        {/* Section 1: Rules Engine */}
        <section>
          <SectionHeader
            title={t("sections.rules.title")}
            subtitle={t("sections.rules.subtitle")}
            accentText="text-secondary"
            accentBg="bg-secondary"
          />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("sections.rules.intro")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ruleCards.map((card, idx) => {
              const Icon = RULE_ICONS[card.icon] || Lock;
              return (
                <div
                  key={card.label}
                  className="showcase-enter"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <TechBorder className="h-full">
                    <div className="p-5 flex flex-col h-full">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 border border-border-strong flex items-center justify-center text-secondary">
                          <Icon size={16} />
                        </div>
                        <span className="font-bold text-text text-sm uppercase tracking-wider">
                          {card.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted font-mono leading-relaxed mb-3">{card.desc}</p>
                      <div className="mt-auto bg-bg border border-border px-3 py-2 font-mono text-xs text-secondary">
                        {card.example}
                      </div>
                    </div>
                  </TechBorder>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Policy Pipeline */}
        <section>
          <SectionHeader
            title={t("sections.pipeline.title")}
            subtitle={t("sections.pipeline.subtitle")}
            accentText="text-secondary"
            accentBg="bg-secondary"
          />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("sections.pipeline.intro")}
          </p>

          {/* Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {pipelineSteps.map((step, idx) => (
              <div
                key={step.num}
                className="group relative bg-surface border border-border hover:border-secondary transition-colors p-5 showcase-enter overflow-hidden"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="absolute right-3 top-3 font-mono text-xs text-border group-hover:text-secondary/30 transition-colors">
                  {step.status}
                </div>
                <div className="font-mono text-xs text-secondary tracking-widest mb-3">
                  {step.num} {"//"}
                </div>
                <div className="font-bold text-text text-sm uppercase tracking-wider mb-2">
                  {step.label}
                </div>
                <p className="text-xs text-muted font-mono leading-relaxed">{step.desc}</p>
                <div className="absolute bottom-0 left-0 h-1 w-0 bg-secondary group-hover:w-full transition-all duration-300" />
              </div>
            ))}
          </div>

          {/* Connectors -- desktop only */}
          <div className="hidden md:flex items-center justify-center gap-3 -mt-4 mb-8">
            <ChevronRight className="text-subtle" size={16} />
            <span className="font-mono text-xs text-subtle tracking-widest">MIDDLEWARE PIPELINE</span>
            <ChevronRight className="text-subtle" size={16} />
          </div>

          {/* Outcomes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {outcomes.map((outcome) => (
              <div
                key={outcome.label}
                className={`border p-4 ${
                  outcome.color === "text-success" ? "border-success/30 bg-success/5" :
                  outcome.color === "text-error" ? "border-error/30 bg-error/5" :
                  "border-warning/30 bg-warning/5"
                }`}
              >
                <div className={`flex items-center gap-2 font-bold text-xs uppercase tracking-wider mb-2 ${outcome.color}`}>
                  <span className={`w-2 h-2 ${outcome.bg}`} />
                  {outcome.label}
                </div>
                <p className="text-xs text-muted font-mono">{outcome.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Owner Control */}
        <section>
          <SectionHeader
            title={t("sections.owner.title")}
            subtitle={t("sections.owner.subtitle")}
            accentText="text-secondary"
            accentBg="bg-secondary"
          />
          <p className="text-sm text-muted font-mono mb-10 max-w-2xl">
            {t("sections.owner.intro")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ownerCards.map((card, idx) => {
              const Icon = RULE_ICONS[card.icon] || Lock;
              return (
                <div
                  key={card.label}
                  className="showcase-enter"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <TechBorder className="h-full">
                    <div className="p-5 flex flex-col h-full">
                      <div className="w-8 h-8 border border-border-strong flex items-center justify-center text-secondary mb-3">
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
        </section>
      </FeaturePageLayout>
    </>
  );
}
