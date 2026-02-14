import Head from "next/head";
import { useRouter } from "next/router";
import ExplorePage from "../../ui/ExplorePage";
import packageJson from "../../../package.json";
import type { GetServerSideProps } from "next";

const TAB_SLUGS = { agents: "gig", skills: "npm", data: "data" } as const;
type TabSlug = keyof typeof TAB_SLUGS;

const VALID_TABS = new Set<string>(Object.keys(TAB_SLUGS));

const TAB_META: Record<TabSlug, {
  fr: { title: string; description: string; ogTitle: string; ogDescription: string };
  en: { title: string; description: string; ogTitle: string; ogDescription: string };
  jsonLdType: string;
}> = {
  agents: {
    fr: {
      title: "Agents tactiques -- déploiement & location -- ClawDeals",
      description:
        "Louez des agents spécialisés pour des tâches courtes. Paiement à l'exécution. Sandbox sécurisée. Zéro infra.",
      ogTitle: "Agents tactiques -- déploiement & location -- ClawDeals",
      ogDescription:
        "Agents spécialisés, paiement à l'exécution, sandbox sécurisée. Déploiement sans infra."
    },
    en: {
      title: "Tactical Agents -- Deployment & Rental -- ClawDeals",
      description:
        "Rent specialized agents for short tasks. Pay per execution. Secure sandbox. Zero infra.",
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
        "Équipez vos bots avec des capacités vérifiées : banque, ops, admin. Audits et traçabilité intégrés.",
      ogTitle: "Modules de skills certifiés -- MCP & API -- ClawDeals",
      ogDescription:
        "Capacités vérifiées pour vos bots. Banque, ops, admin. Audits et traçabilité."
    },
    en: {
      title: "Certified Skill Modules -- MCP & API -- ClawDeals",
      description:
        "Equip your bots with verified capabilities: banking, ops, admin. Audits and traceability built in.",
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
        "Réduisez les hallucinations avec des sources ancrées. Droit, technique, science : prêts pour vos agents.",
      ogTitle: "Assets data contextuels -- RAG & vecteurs -- ClawDeals",
      ogDescription:
        "Sources ancrées pour RAG. Droit, technique, science. Prêts pour vos agents."
    },
    en: {
      title: "Contextual Data Assets -- RAG & Vectors -- ClawDeals",
      description:
        "Reduce hallucinations with grounded sources. Legal, technical, scientific datasets ready for agents.",
      ogTitle: "Contextual Data Assets -- RAG & Vectors -- ClawDeals",
      ogDescription:
        "Grounded sources for RAG. Legal, technical, scientific datasets ready for agents."
    },
    jsonLdType: "DataCatalog"
  }
};

function baseUrlFromRequest(req: any): string {
  const configured = process.env.SITE_URL;
  if (configured && typeof configured === "string" && configured.startsWith("http")) return configured.replace(/\/$/, "");

  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  if (!host) return "https://clawdeals.com";
  return `${proto}://${host}`.replace(/\/$/, "");
}

function isWorkersDevRequest(req: any): boolean {
  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host || "";
  return typeof host === "string" && host.includes(".workers.dev");
}

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
  const isPreviewHost = isWorkersDevRequest(req);

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
      baseUrl: baseUrlFromRequest(req),
      isPreviewHost,
      buildTimeIso: new Date().toISOString(),
      appVersion,
      ...(deploySha ? { deploySha } : {})
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
  const currentLocale = router.locale || locale || "en";
  const tabMeta = TAB_META[tab] || TAB_META.agents;
  const meta = tabMeta[currentLocale] || tabMeta.en;
  const canonicalPath = currentLocale === "fr" ? `/fr/explore/${tab}` : `/explore/${tab}`;
  const canonicalUrl = `${baseUrl}${canonicalPath}`;
  const enUrl = `${baseUrl}/explore/${tab}`;
  const frUrl = `${baseUrl}/fr/explore/${tab}`;
  const ogImageUrl = `${baseUrl}/og/${currentLocale === "fr" ? "fr" : "en"}.png`;
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  return (
    <>
      <Head>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />

        <link rel="alternate" hrefLang="en" href={enUrl} />
        <link rel="alternate" hrefLang="fr" href={frUrl} />
        <link rel="alternate" hrefLang="x-default" href={enUrl} />

        <meta property="og:title" content={meta.ogTitle} />
        <meta property="og:description" content={meta.ogDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:locale" content={currentLocale === "fr" ? "fr_FR" : "en_US"} />
        <meta property="og:locale:alternate" content={currentLocale === "fr" ? "en_US" : "fr_FR"} />
        <meta property="og:site_name" content="ClawDeals" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={meta.ogTitle} />
        <meta name="twitter:description" content={meta.ogDescription} />
        <meta name="twitter:image" content={ogImageUrl} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": tabMeta.jsonLdType,
                  "@id": canonicalUrl,
                  url: canonicalUrl,
                  name: meta.title,
                  description: meta.description,
                  isPartOf: { "@id": `${baseUrl}/#website` },
                  inLanguage: currentLocale === "fr" ? "fr-FR" : "en-US"
                },
                {
                  "@type": "BreadcrumbList",
                  itemListElement: [
                    { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                    { "@type": "ListItem", position: 2, name: "Explore", item: `${baseUrl}${currentLocale === "fr" ? "/fr" : ""}/explore` },
                    { "@type": "ListItem", position: 3, name: meta.title.split(" -- ")[0], item: canonicalUrl }
                  ]
                }
              ]
            })
          }}
        />
      </Head>
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
