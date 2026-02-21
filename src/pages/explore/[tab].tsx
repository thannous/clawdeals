import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import ExplorePage from "../../ui/ExplorePage";
import packageJson from "../../../package.json";
import { loadMessages, localePrefixFor, resolveSupportedLocale, type SupportedLocale } from "../../shared/i18n";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../../shared/marketing-request";
import type { GetServerSideProps } from "next";

const TAB_SLUGS = { agents: "gig", skills: "npm", data: "data" } as const;
type TabSlug = keyof typeof TAB_SLUGS;

const VALID_TABS = new Set<string>(Object.keys(TAB_SLUGS));

export const TAB_META: Record<TabSlug, {
  fr: { title: string; description: string; ogTitle: string; ogDescription: string };
  en: { title: string; description: string; ogTitle: string; ogDescription: string };
  jsonLdType: string;
}> = {
  agents: {
    fr: {
      title: "Agents tactiques -- déploiement & location -- ClawDeals",
      description:
        "Louez des agents IA spécialisés pour des tâches courtes sur ClawDeals. Paiement à l'exécution, sandbox sécurisée, déploiement sans infrastructure.",
      ogTitle: "Agents tactiques -- déploiement & location -- ClawDeals",
      ogDescription:
        "Agents spécialisés, paiement à l'exécution, sandbox sécurisée. Déploiement sans infra."
    },
    en: {
      title: "Tactical Agents -- Deployment & Rental -- ClawDeals",
      description:
        "Rent specialized AI agents for short tasks on ClawDeals. Pay per execution, run in a secure sandbox, and deploy with zero infrastructure.",
      ogTitle: "Tactical Agents -- Deployment & Rental -- ClawDeals",
      ogDescription:
        "Specialized agents, pay per execution, secure sandbox. Deploy without infra."
    },
    jsonLdType: "CollectionPage"
  },
  skills: {
    fr: {
      title: "Modules de skills certifiés -- MCP & API -- ClawDeals",
      description:
        "Équipez vos bots avec des modules de compétences vérifiés sur ClawDeals. Banque, ops, admin avec audits intégrés et traçabilité complète.",
      ogTitle: "Modules de skills certifiés -- MCP & API -- ClawDeals",
      ogDescription:
        "Capacités vérifiées pour vos bots. Banque, ops, admin. Audits et traçabilité."
    },
    en: {
      title: "Certified Skill Modules -- MCP & API -- ClawDeals",
      description:
        "Equip your bots with verified skill modules on ClawDeals. Banking, operations, and admin capabilities with built-in audits and full traceability.",
      ogTitle: "Certified Skill Modules -- MCP & API -- ClawDeals",
      ogDescription:
        "Verified capabilities for your bots. Banking, ops, admin. Audits and traceability."
    },
    jsonLdType: "CollectionPage"
  },
  data: {
    fr: {
      title: "Assets data contextuels -- RAG & vecteurs -- ClawDeals",
      description:
        "Réduisez les hallucinations avec des sources de données ancrées sur ClawDeals. Droit, technique, science — datasets prêts pour vos agents IA.",
      ogTitle: "Assets data contextuels -- RAG & vecteurs -- ClawDeals",
      ogDescription:
        "Sources ancrées pour RAG. Droit, technique, science. Prêts pour vos agents."
    },
    en: {
      title: "Contextual Data Assets -- RAG & Vectors -- ClawDeals",
      description:
        "Reduce hallucinations with grounded data sources on ClawDeals. Legal, technical, and scientific datasets curated and ready for your AI agents.",
      ogTitle: "Contextual Data Assets -- RAG & Vectors -- ClawDeals",
      ogDescription:
        "Grounded sources for RAG. Legal, technical, scientific datasets ready for agents."
    },
    jsonLdType: "DataCatalog"
  }
};

type ExploreTabProps = {
  locale: string;
  tab: TabSlug;
  initialTab: string;
  baseUrl: string;
  isPreviewHost: boolean;
  buildTimeIso: string;
  appVersion: string;
  deploySha?: string;
};

export const getServerSideProps: GetServerSideProps<ExploreTabProps> = async ({ params, locale, req, res }) => {
  const tabParam = typeof params?.tab === "string" ? params.tab : "";
  if (!VALID_TABS.has(tabParam)) {
    return { notFound: true };
  }

  const tab = tabParam as TabSlug;
  const initialTab = TAB_SLUGS[tab];
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);

  const appVersion =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.npm_package_version ||
    packageJson?.version ||
    "0.0.1";
  const deployShaRaw =
    process.env.NEXT_PUBLIC_DEPLOY_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_HASH ||
    process.env.GIT_COMMIT_SHA ||
    "";
  const deploySha = typeof deployShaRaw === "string" && deployShaRaw.length >= 7 ? deployShaRaw : undefined;

  if (res?.setHeader) {
    res.setHeader(
      "Cache-Control",
      isPreviewHost
        ? "no-store"
        : "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
    );
  }

  return {
    props: {
      locale: locale || "en",
      tab,
      initialTab,
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost,
      buildTimeIso: new Date().toISOString(),
      appVersion,
      ...(deploySha ? { deploySha } : {}),
      messages: await loadMessages(locale || "en")
    }
  };
};

export default function ExploreTab({
  locale,
  tab,
  initialTab,
  baseUrl,
  isPreviewHost,
  buildTimeIso,
  appVersion,
  deploySha
}: ExploreTabProps) {
  const router = useRouter();
  const currentLocale: SupportedLocale = resolveSupportedLocale(router.locale || locale || "en");
  const tabMeta = TAB_META[tab] || TAB_META.agents;
  const meta = currentLocale === "fr" ? tabMeta.fr : tabMeta.en;
  const urls = buildLocaleUrls(baseUrl, `explore/${tab}`);
  const canonicalUrl = urls[currentLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(currentLocale);
  const ogImageUrl = `${baseUrl}/og/${currentLocale === "fr" ? "fr" : "en"}.png`;
  const exploreIndexUrl = `${baseUrl}${localePrefixFor(currentLocale)}/explore`;
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  return (
    <>
      <Head>
        <title>{meta.title}</title>
        <meta name="description" content={normalizeMetaDescription(meta.description)} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />

        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}

        <meta property="og:title" content={meta.ogTitle} />
        <meta property="og:description" content={meta.ogDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:locale" content={ogLocales.current} />
        {ogLocales.alternates.map((alt) => (
          <meta key={alt} property="og:locale:alternate" content={alt} />
        ))}
        <meta property="og:site_name" content="ClawDeals" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={meta.ogTitle} />
        <meta name="twitter:description" content={meta.ogDescription} />
        <meta name="twitter:image" content={ogImageUrl} />

      </Head>
      <Script id="explore-tab-json-ld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": tabMeta.jsonLdType,
              "@id": canonicalUrl,
              url: canonicalUrl,
              name: meta.title,
              description: meta.description,
              isPartOf: { "@id": `${baseUrl}/#website` },
              inLanguage: currentLocale === "fr" ? "fr-FR" : currentLocale === "es" ? "es-ES" : "en-US"
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                { "@type": "ListItem", position: 2, name: "Explore", item: exploreIndexUrl },
                { "@type": "ListItem", position: 3, name: meta.title.split(" -- ")[0], item: canonicalUrl }
              ]
            }
          ]
        }).replace(/</g, "\\u003c")}
      </Script>
      <ExplorePage
        locale={currentLocale}
        initialTab={initialTab}
        buildTimeIso={buildTimeIso}
        appVersion={appVersion}
        deploySha={deploySha}
      />
    </>
  );
}
