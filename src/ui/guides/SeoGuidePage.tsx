import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, ExternalLink } from "lucide-react";
import { getSeoGuideEnhancement } from "../../content/seo-guide-enhancements";
import { buildSeoGuideStructuredData } from "../../content/seo-guide-schema";
import { SEO_GUIDES, getSeoGuide, type GuideSlug } from "../../content/seo-guides";
import { resolveSupportedLocale, withMessages, type SupportedLocale } from "../../shared/i18n";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../shared/marketing-request";
import { buildLocaleUrls, hrefLangTags, normalizeMetaDescription, ogLocaleTags } from "../../shared/seo";
import FeaturePageLayout from "../feature/FeaturePageLayout";
import { SectionHeader, TechBorder } from "../landing/primitives";
import MarketingLink from "../shared/MarketingLink";

export type SeoGuidePageProps = {
  baseUrl: string;
  isPreviewHost: boolean;
  messages: any;
};

export function JsonLd({ id, data }: { id: string; data: unknown }) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export const getSeoGuideServerSideProps: GetServerSideProps<SeoGuidePageProps> = async ({ req, res, locale }) => {
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

const CTA_PATHS = {
  openclaw: "/integrations/openclaw",
  security: "/guides/mcp-marketplace-safety",
  governance: "/policy-control",
  marketplaces: "/marketplace"
} as const;

const RELATED_LABELS: Record<SupportedLocale, Record<string, string>> = {
  en: {
    "/integrations/openclaw": "Connect OpenClaw",
    "/guides/openclaw-dealwatch": "Build a DealWatch workflow",
    "/guides/mcp-marketplace-safety": "MCP marketplace safety",
    "/audit-trail": "Understand the audit trail",
    "/policy-control": "Configure Policy Control",
    "/marketplace": "Explore the marketplace",
    "/trust-engine": "Understand the Trust Engine"
  },
  fr: {
    "/integrations/openclaw": "Connecter OpenClaw",
    "/guides/openclaw-dealwatch": "Créer un workflow DealWatch",
    "/guides/mcp-marketplace-safety": "Sécurité d'une marketplace MCP",
    "/audit-trail": "Comprendre l'audit trail",
    "/policy-control": "Configurer Policy Control",
    "/marketplace": "Explorer le marketplace",
    "/trust-engine": "Comprendre le Trust Engine"
  },
  es: {
    "/integrations/openclaw": "Conectar OpenClaw",
    "/guides/openclaw-dealwatch": "Crear un flujo DealWatch",
    "/guides/mcp-marketplace-safety": "Seguridad de un marketplace MCP",
    "/audit-trail": "Entender la auditoría",
    "/policy-control": "Configurar Policy Control",
    "/marketplace": "Explorar el marketplace",
    "/trust-engine": "Entender Trust Engine"
  }
};

const UI_COPY: Record<SupportedLocale, { related: string; market: string; author: string }> = {
  en: { related: "Related guides", market: "Market", author: "ClawDeals Editorial Team" },
  fr: { related: "Guides associés", market: "Marché", author: "Équipe éditoriale ClawDeals" },
  es: { related: "Guías relacionadas", market: "Mercado", author: "Equipo editorial de ClawDeals" }
};

function languageTag(locale: SupportedLocale) {
  if (locale === "fr") return "fr-FR";
  if (locale === "es") return "es-ES";
  return "en-GB";
}

function formatDate(value: string, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(languageTag(locale), {
    dateStyle: "medium",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

function relatedLabel(path: string, locale: SupportedLocale) {
  if (RELATED_LABELS[locale][path]) return RELATED_LABELS[locale][path];
  const slug = path.replace(/^\/guides\//, "");
  const guide = SEO_GUIDES.find((candidate) => candidate.slug === slug);
  return guide?.content[locale].title || path;
}

export default function SeoGuidePage({
  slug,
  baseUrl,
  isPreviewHost
}: SeoGuidePageProps & { slug: GuideSlug }) {
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);
  const guide = getSeoGuide(slug);
  const content = guide.content[locale];
  const enhancement = getSeoGuideEnhancement(slug, locale);
  const urls = buildLocaleUrls(baseUrl, `guides/${slug}`);
  const canonicalUrl = urls[locale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(locale);
  const ogImageUrl = `${baseUrl}/og/${locale}.png`;
  const ui = UI_COPY[locale];
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  const structuredData = buildSeoGuideStructuredData({ slug, locale, baseUrl });

  return (
    <>
      <Head>
        <title>{content.metaTitle}</title>
        <meta name="description" content={normalizeMetaDescription(content.metaDescription)} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />
        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}
        <meta property="og:title" content={content.title} />
        <meta property="og:description" content={content.metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content={ogLocales.current} />
        {ogLocales.alternates.map((alternate) => (
          <meta key={alternate} property="og:locale:alternate" content={alternate} />
        ))}
        <meta property="og:site_name" content="ClawDeals" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={content.title} />
        <meta name="twitter:description" content={content.metaDescription} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      <JsonLd id={`guide-${slug}-json-ld`} data={structuredData} />

      <FeaturePageLayout
        title={content.title}
        subtitle={content.eyebrow}
        description={content.introduction}
        icon={<BookOpen size={20} />}
        accentColor="text-primary"
        accentBg="bg-primary"
        contentAs="article"
      >
        <section aria-label={content.tableOfContentsLabel}>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-stretch">
            <div className="relative min-h-[240px] border border-border overflow-hidden bg-surface">
              <Image
                src={`/og/${locale}.png`}
                alt={content.title}
                fill
                sizes="(max-width: 1024px) 100vw, 640px"
                className="object-cover"
              />
            </div>
            <TechBorder className="h-full">
              <div className="p-5 h-full">
                <h2 className="font-bold uppercase tracking-wider text-sm text-text mb-4">
                  {content.tableOfContentsLabel}
                </h2>
                <ol className="space-y-3">
                  {content.sections.map((section) => (
                    <li key={section.id}>
                      <a href={`#${section.id}`} className="font-mono text-xs text-muted hover:text-primary transition-colors">
                        {section.title}
                      </a>
                    </li>
                  ))}
                  <li>
                    <a href="#comparison" className="font-mono text-xs text-muted hover:text-primary transition-colors">
                      {enhancement.table.caption}
                    </a>
                  </li>
                  <li>
                    <a href="#faq" className="font-mono text-xs text-muted hover:text-primary transition-colors">
                      {enhancement.faqHeading}
                    </a>
                  </li>
                  <li>
                    <a href="#sources" className="font-mono text-xs text-muted hover:text-primary transition-colors">
                      {enhancement.sourcesHeading}
                    </a>
                  </li>
                </ol>
              </div>
            </TechBorder>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-y border-border py-4 font-mono text-xs text-muted">
            <span className="inline-flex items-center gap-2"><CalendarDays size={14} className="text-primary" />{content.publishedLabel}: <time dateTime={guide.publishedAt}>{formatDate(guide.publishedAt, locale)}</time></span>
            <span className="inline-flex items-center gap-2"><CalendarDays size={14} className="text-secondary" />{content.updatedLabel}: <time dateTime={guide.updatedAt}>{formatDate(guide.updatedAt, locale)}</time></span>
            <span className="inline-flex items-center gap-2"><Clock3 size={14} className="text-success" />{content.formatLabel}</span>
            <span>
              {content.authorLabel}:{" "}
              <MarketingLink href="/about/editorial" className="underline decoration-border-strong underline-offset-4 hover:text-primary">
                {ui.author}
              </MarketingLink>
            </span>
            <span>{ui.market}: {guide.market === "global" ? "GLOBAL" : guide.market.join(" / ")}</span>
          </div>
        </section>

        {content.sections.map((section, sectionIndex) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <SectionHeader
              title={section.title}
              subtitle={`${String(sectionIndex + 1).padStart(2, "0")} // ${guide.category.toUpperCase()}`}
            />
            <div className="space-y-4 max-w-3xl">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm md:text-base text-muted leading-7">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="space-y-3 pt-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-sm text-muted leading-6">
                      <CheckCircle2 size={16} className="text-success mt-1 shrink-0" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {section.callout ? (
                <div className="border-l-2 border-warning bg-warning/5 px-5 py-4 font-mono text-sm text-text leading-6">
                  {section.callout}
                </div>
              ) : null}
            </div>
          </section>
        ))}

        <section id="comparison" className="scroll-mt-24" aria-labelledby="comparison-heading">
          <SectionHeader title={enhancement.table.caption} subtitle="DECISION_TABLE" />
          <div className="overflow-x-auto border border-border bg-surface">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm text-muted">
              <caption id="comparison-heading" className="sr-only">{enhancement.table.caption}</caption>
              <thead className="bg-surface-alt text-text">
                <tr>
                  {enhancement.table.columns.map((column) => (
                    <th key={column} scope="col" className="border-b border-r last:border-r-0 border-border px-4 py-3 font-mono text-xs uppercase tracking-wider">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enhancement.table.rows.map((row) => (
                  <tr key={row.join("|")} className="border-b last:border-b-0 border-border align-top">
                    {row.map((cell, index) => (
                      <td key={`${index}-${cell}`} className={`border-r last:border-r-0 border-border px-4 py-4 leading-6 ${index === 0 ? "font-bold text-text" : ""}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24">
          <SectionHeader title={enhancement.faqHeading} subtitle="FAQ" />
          <div className="space-y-4 max-w-3xl">
            {enhancement.faqs.map((faq) => (
              <details key={faq.question} className="group border border-border bg-surface p-5" open>
                <summary className="cursor-pointer list-none font-bold text-sm text-text pr-6 marker:hidden">
                  {faq.question}
                </summary>
                <p className="mt-3 text-sm text-muted leading-7">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="sources" className="scroll-mt-24">
          <SectionHeader title={enhancement.sourcesHeading} subtitle="PRIMARY_SOURCES" />
          <p className="text-sm text-muted leading-7 max-w-3xl mb-5">{enhancement.sourcesIntro}</p>
          <ul className="space-y-3 max-w-3xl">
            {enhancement.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  className="flex items-start gap-3 border border-border bg-surface p-4 text-sm text-muted hover:border-primary hover:text-text transition-colors"
                  {...(source.url.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  <ExternalLink size={15} className="mt-1 shrink-0 text-primary" />
                  <span><strong className="text-text">{source.publisher}:</strong> {source.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <TechBorder>
            <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <h2 className="text-xl font-bold uppercase tracking-wider text-text mb-2">{content.ctaTitle}</h2>
                <p className="text-sm text-muted leading-6">{content.ctaBody}</p>
              </div>
              <MarketingLink
                href={CTA_PATHS[guide.category]}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 border border-primary bg-primary text-bg font-bold uppercase tracking-wider text-xs hover:bg-text hover:border-text transition-colors"
              >
                {content.ctaLabel}<ArrowRight size={14} />
              </MarketingLink>
            </div>
          </TechBorder>
        </section>

        <section>
          <SectionHeader title={ui.related} subtitle="RELATED_CONTENT" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {guide.relatedGuides.map((path) => (
              <MarketingLink key={path} href={path} className="group border border-border bg-surface p-5 hover:border-primary transition-colors">
                <span className="font-bold text-sm text-text group-hover:text-primary transition-colors">{relatedLabel(path, locale)}</span>
                <ArrowRight size={14} className="text-subtle group-hover:text-primary mt-4" />
              </MarketingLink>
            ))}
          </div>
        </section>
      </FeaturePageLayout>
    </>
  );
}
