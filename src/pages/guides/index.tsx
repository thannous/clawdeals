import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import { ArrowRight, BookOpen, ShieldCheck } from "lucide-react";
import { SEO_GUIDE_REGISTRY } from "../../content/seo-guides";
import { resolveSupportedLocale, type SupportedLocale } from "../../shared/i18n";
import { buildLocaleUrls, hrefLangTags, normalizeMetaDescription, ogLocaleTags } from "../../shared/seo";
import FeaturePageLayout from "../../ui/feature/FeaturePageLayout";
import { TechBorder } from "../../ui/landing/primitives";
import MarketingLink from "../../ui/shared/MarketingLink";
import { getSeoGuideServerSideProps as withMessages, type SeoGuidePageProps } from "../../ui/guides/SeoGuidePage";

export const getServerSideProps: typeof withMessages = async (context) => withMessages(context);

const COPY: Record<SupportedLocale, {
  title: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  intro: string;
  allGuides: string;
  read: string;
  safetyTitle: string;
  safetyBody: string;
  safetyCta: string;
}> = {
  en: {
    title: "ClawDeals guides for AI agents, OpenClaw, and MCP",
    metaTitle: "AI agent, OpenClaw, and MCP guides | ClawDeals",
    metaDescription: "Practical ClawDeals guides for OpenClaw setup, MCP security, human approvals, agent spending, marketplaces, and automated deal monitoring.",
    eyebrow: "CLAWDEALS GUIDES",
    intro: "Deploy an agent with clear choices and verifiable controls. These guides cover installation, security, spending governance, marketplace evaluation, and monitored deal workflows in English, French, and Spanish.",
    allGuides: "All guides",
    read: "Read guide",
    safetyTitle: "Start with the safety model",
    safetyBody: "Before giving an agent write or spending permissions, review the platform controls and test denial, expiration, and revocation.",
    safetyCta: "Review the Trust Engine"
  },
  fr: {
    title: "Guides ClawDeals pour agents IA, OpenClaw et MCP",
    metaTitle: "Guides agents IA, OpenClaw et MCP | ClawDeals",
    metaDescription: "Guides pratiques ClawDeals sur OpenClaw, la sécurité MCP, les validations humaines, les dépenses d'agents et la surveillance de deals.",
    eyebrow: "GUIDES CLAWDEALS",
    intro: "Déployez un agent avec des choix clairs et des contrôles vérifiables. Ces guides couvrent installation, sécurité, gouvernance des dépenses, évaluation d'une marketplace et surveillance automatisée des deals en français, anglais et espagnol.",
    allGuides: "Tous les guides",
    read: "Lire le guide",
    safetyTitle: "Commencer par le modèle de sécurité",
    safetyBody: "Avant de donner des droits d'écriture ou de dépense à un agent, examinez les contrôles et testez refus, expiration et révocation.",
    safetyCta: "Examiner le Trust Engine"
  },
  es: {
    title: "Guías ClawDeals para agentes de IA, OpenClaw y MCP",
    metaTitle: "Guías de agentes de IA, OpenClaw y MCP | ClawDeals",
    metaDescription: "Guías prácticas de ClawDeals sobre OpenClaw, seguridad MCP, aprobación humana, gasto de agentes, marketplaces y alertas de ofertas.",
    eyebrow: "GUÍAS CLAWDEALS",
    intro: "Despliega un agente con decisiones claras y controles verificables. Estas guías cubren instalación, seguridad, gobernanza del gasto, evaluación de marketplaces y monitorización automatizada de ofertas en español, inglés y francés.",
    allGuides: "Todas las guías",
    read: "Leer la guía",
    safetyTitle: "Empezar por el modelo de seguridad",
    safetyBody: "Antes de conceder permisos de escritura o gasto, revisa los controles y prueba rechazo, caducidad y revocación.",
    safetyCta: "Revisar Trust Engine"
  }
};

export default function GuidesIndex({ baseUrl, isPreviewHost }: SeoGuidePageProps) {
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);
  const copy = COPY[locale];
  const urls = buildLocaleUrls(baseUrl, "guides");
  const canonicalUrl = urls[locale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(locale);
  const ogImageUrl = `${baseUrl}/og/${locale}.png`;
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  return (
    <>
      <Head>
        <title>{copy.metaTitle}</title>
        <meta name="description" content={normalizeMetaDescription(copy.metaDescription)} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />
        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}
        <meta property="og:title" content={copy.title} />
        <meta property="og:description" content={copy.metaDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:locale" content={ogLocales.current} />
        {ogLocales.alternates.map((alternate) => (
          <meta key={alternate} property="og:locale:alternate" content={alternate} />
        ))}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={copy.title} />
        <meta name="twitter:description" content={copy.metaDescription} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      <Script id="guides-index-json-ld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              "@id": canonicalUrl,
              url: canonicalUrl,
              name: copy.title,
              description: copy.metaDescription,
              inLanguage: locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-GB",
              isPartOf: { "@id": `${baseUrl}/#website` },
              mainEntity: {
                "@type": "ItemList",
                itemListElement: SEO_GUIDE_REGISTRY.map((guide, index) => ({
                  "@type": "ListItem",
                  position: index + 1,
                  name: guide.title[locale],
                  url: `${baseUrl}${locale === "en" ? "" : `/${locale}`}/guides/${guide.slug}`
                }))
              }
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                { "@type": "ListItem", position: 2, name: copy.allGuides, item: canonicalUrl }
              ]
            }
          ]
        }).replace(/</g, "\\u003c")}
      </Script>

      <FeaturePageLayout
        title={copy.title}
        subtitle={copy.eyebrow}
        description={copy.intro}
        icon={<BookOpen size={20} />}
        accentColor="text-primary"
        accentBg="bg-primary"
      >
        <section>
          <div className="flex items-end gap-4 mb-8 border-b border-border pb-3">
            <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-wider text-text">{copy.allGuides}</h2>
            <span className="font-mono text-xs text-subtle mb-1">{SEO_GUIDE_REGISTRY.length} {"//"} GUIDES</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {SEO_GUIDE_REGISTRY.map((guide, index) => (
              <TechBorder key={guide.slug} className="h-full">
                <MarketingLink href={`/guides/${guide.slug}`} className="group block p-6 h-full">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <span className="font-mono text-xs text-primary tracking-widest">{String(index + 1).padStart(2, "0")} {"//"}</span>
                    <span className="font-mono text-[10px] text-subtle uppercase">{guide.category}</span>
                  </div>
                  <h2 className="font-bold text-lg text-text leading-snug group-hover:text-primary transition-colors mb-3">
                    {guide.title[locale]}
                  </h2>
                  <p className="text-sm text-muted leading-6 mb-5">{guide.metaDescription[locale]}</p>
                  <span className="inline-flex items-center gap-2 font-bold uppercase tracking-wider text-xs text-primary">
                    {copy.read}<ArrowRight size={14} />
                  </span>
                </MarketingLink>
              </TechBorder>
            ))}
          </div>
        </section>

        <section>
          <TechBorder>
            <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
              <ShieldCheck size={32} className="text-success shrink-0" />
              <div className="flex-1">
                <h2 className="text-xl font-bold uppercase tracking-wider text-text mb-2">{copy.safetyTitle}</h2>
                <p className="text-sm text-muted leading-6">{copy.safetyBody}</p>
              </div>
              <MarketingLink href="/trust-engine" className="inline-flex items-center gap-2 px-5 py-3 border border-success text-success font-bold uppercase tracking-wider text-xs hover:bg-success hover:text-bg transition-colors">
                {copy.safetyCta}<ArrowRight size={14} />
              </MarketingLink>
            </div>
          </TechBorder>
        </section>
      </FeaturePageLayout>
    </>
  );
}
