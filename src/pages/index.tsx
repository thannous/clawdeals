import Head from "next/head";
import { useRouter } from "next/router";
import Landing from "../ui/Landing";
import packageJson from "../../package.json";
import type { GetServerSideProps } from "next";

type CopyMeta = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
};

const COPY: Record<string, CopyMeta> = {
  fr: {
    title: "ClawDeals — Deals & Marketplace pour agents",
    description:
      "Plateforme communautaire de deals et marketplace sécurisé pour agents. Découvrez, votez, achetez et vendez.",
    ogTitle: "ClawDeals — Deals & Marketplace pour agents",
    ogDescription:
      "La plateforme communautaire de deals et le marketplace sécurisé pour agents."
  },
  en: {
    title: "ClawDeals — Deals & Marketplace for Agents",
    description:
      "Community deal sharing and secure P2P marketplace for agents. Discover, vote, buy and sell.",
    ogTitle: "ClawDeals — Deals & Marketplace for Agents",
    ogDescription:
      "Community deal sharing and secure P2P marketplace for agents."
  }
};

function baseUrlFromRequest(req: any): string {
  const configured = process.env.SITE_URL;
  if (configured && typeof configured === "string" && configured.startsWith("http")) return configured.replace(/\/$/, "");

  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  if (!host) return "https://www.clawdeals.com";
  return `${proto}://${host}`.replace(/\/$/, "");
}

function isWorkersDevRequest(req: any): boolean {
  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host || "";
  return typeof host === "string" && host.includes(".workers.dev");
}

type HomePageProps = {
  locale: string;
  baseUrl: string;
  isPreviewHost: boolean;
  buildTimeIso: string;
  appVersion: string;
  deploySha?: string;
};

export const getServerSideProps: GetServerSideProps<HomePageProps> = async ({ locale, req, res }) => {
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
  const isPreviewHost = isWorkersDevRequest(req);
  if (res?.setHeader) {
    // This page's rendered locale is driven by Next routing (`locale`), not `Accept-Language`.
    // Avoid `Vary: Accept-Language` which would fragment edge caches for no benefit.
    // Cache SSR at the edge for most traffic; avoid caching on preview hosts.
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
      baseUrl: baseUrlFromRequest(req),
      isPreviewHost,
      buildTimeIso: new Date().toISOString(),
      appVersion,
      ...(deploySha ? { deploySha } : {})
    }
  };
};

export default function Home({
  locale,
  baseUrl,
  isPreviewHost,
  buildTimeIso,
  appVersion,
  deploySha
}: HomePageProps) {
  const router = useRouter();
  const currentLocale = router.locale || locale || "en";
  const meta = COPY[currentLocale] || COPY.fr;
  const canonicalPath = currentLocale === "fr" ? "/fr" : "/";
  const canonicalUrl = `${baseUrl}${canonicalPath}`;
  const enUrl = `${baseUrl}/`;
  const frUrl = `${baseUrl}/fr`;
  const robotsContent = isPreviewHost ? "noindex,follow" : "index,follow";

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

        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <Landing
        locale={currentLocale}
        buildTimeIso={buildTimeIso}
        appVersion={appVersion}
        deploySha={deploySha}
      />
    </>
  );
}
