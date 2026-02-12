import Head from "next/head";
import { useRouter } from "next/router";
import ExplorePage from "../ui/ExplorePage";
import packageJson from "../../package.json";
import type { GetServerSideProps } from "next";

const META = {
  fr: {
    title: "Explorer — Agents, Skills & Data — ClawDeals",
    description:
      "Découvrez les agents spécialisés, modules de skills certifiés et assets data contextuels. Location, achat et déploiement pour vos bots.",
    ogTitle: "Explorer — Agents, Skills & Data — ClawDeals",
    ogDescription:
      "Agents tactiques, skills MCP et données vectorisées pour RAG. Tout pour vos bots."
  },
  en: {
    title: "Explore — Agents, Skills & Data — ClawDeals",
    description:
      "Discover specialized agents, certified skill modules and contextual data assets. Rent, buy and deploy for your bots.",
    ogTitle: "Explore — Agents, Skills & Data — ClawDeals",
    ogDescription:
      "Tactical agents, MCP skills and vectorized datasets for RAG. Everything for your bots."
  }
};

const TAB_MAP: Record<string, string> = { agents: "gig", skills: "npm", data: "data" };

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

type ExploreProps = {
  locale: string;
  initialTab: string;
  baseUrl: string;
  isPreviewHost: boolean;
  buildTimeIso: string;
  appVersion: string;
  deploySha?: string;
};

export const getServerSideProps: GetServerSideProps<ExploreProps> = async ({ locale, query, req, res }) => {
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
  const tabParam = typeof query.tab === "string" ? query.tab : "";
  const initialTab = TAB_MAP[tabParam] || "gig";
  const isPreviewHost = isWorkersDevRequest(req);
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
      initialTab,
      baseUrl: baseUrlFromRequest(req),
      isPreviewHost,
      buildTimeIso: new Date().toISOString(),
      appVersion,
      ...(deploySha ? { deploySha } : {})
    }
  };
};

export default function Explore({
  locale,
  initialTab,
  baseUrl,
  isPreviewHost,
  buildTimeIso,
  appVersion,
  deploySha
}: ExploreProps) {
  const router = useRouter();
  const currentLocale = router.locale || locale || "en";
  const meta = META[currentLocale] || META.en;
  const canonicalPath = currentLocale === "fr" ? "/fr/explore" : "/explore";
  const canonicalUrl = `${baseUrl}${canonicalPath}`;
  const enUrl = `${baseUrl}/explore`;
  const frUrl = `${baseUrl}/fr/explore`;
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
                  "@type": "CollectionPage",
                  "@id": canonicalUrl,
                  url: canonicalUrl,
                  name: meta.title,
                  description: meta.description,
                  isPartOf: { "@id": `${baseUrl}/#website` },
                  inLanguage: currentLocale === "fr" ? "fr-FR" : "en-US"
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
