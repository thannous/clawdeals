import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";

import McpPage from "../ui/mcp/McpPage";
import { loadMessages, DEFAULT_LOCALE, resolveSupportedLocale, type SupportedLocale } from "../shared/i18n";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags, normalizeMetaDescription } from "../shared/seo";

type McpProps = {
  baseUrl: string;
  isPreviewHost: boolean;
  messages: any;
};

export const getServerSideProps: GetServerSideProps<McpProps> = async ({ req, res, locale }) => {
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);
  res.setHeader(
    "Cache-Control",
    isPreviewHost ? "no-store" : "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
  );

  return {
    props: {
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost,
      messages: await loadMessages(locale || DEFAULT_LOCALE)
    }
  };
};

export const MCP_SEO: Record<
  SupportedLocale,
  { title: string; description: string; breadcrumb: string; applicationName: string }
> = {
  en: {
    title: "ClawDeals MCP Server for UK AI Agents | Setup",
    description:
      "Install the ClawDeals MCP server for a GB/GBP watchlist, connect one AI agent, verify the first UK marketplace match, and keep every action auditable.",
    breadcrumb: "MCP Server for the UK",
    applicationName: "ClawDeals MCP Server for UK AI Agents"
  },
  fr: {
    title: "Serveur MCP ClawDeals pour agents IA en France",
    description:
      "Installez le serveur MCP ClawDeals pour une watchlist FR/EUR, connectez un agent IA, puis vérifiez le premier match et sa source en France.",
    breadcrumb: "Serveur MCP France",
    applicationName: "Serveur MCP ClawDeals pour agents IA en France"
  },
  es: {
    title: "Servidor MCP ClawDeals para agentes de IA en España",
    description:
      "Instala el servidor MCP de ClawDeals para una watchlist ES/EUR, conecta un agente de IA y verifica el primer match y su comercio de origen en España.",
    breadcrumb: "Servidor MCP España",
    applicationName: "Servidor MCP ClawDeals para agentes de IA en España"
  }
};

export const META_DESCRIPTION = MCP_SEO.en.description;

export default function Mcp({ baseUrl, isPreviewHost }: McpProps) {
  const router = useRouter();
  const locale: SupportedLocale = resolveSupportedLocale(router.locale);
  const seo = MCP_SEO[locale];
  const urls = buildLocaleUrls(baseUrl, "mcp");
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
        <title>{seo.title}</title>
        <meta name="description" content={normalizeMetaDescription(seo.description)} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />
        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}

        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
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
        <meta name="twitter:title" content={seo.title} />
        <meta name="twitter:description" content={seo.description} />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>
      <Script id="mcp-server-json-ld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "SoftwareApplication",
              "@id": canonicalUrl,
              name: seo.applicationName,
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any",
              description: seo.description,
              url: canonicalUrl,
              inLanguage: locale === "fr" ? "fr-FR" : locale === "es" ? "es-ES" : "en-GB",
              isPartOf: { "@id": `${baseUrl}/#website` }
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                { "@type": "ListItem", position: 2, name: seo.breadcrumb, item: canonicalUrl }
              ]
            }
          ]
        }).replace(/</g, "\\u003c")}
      </Script>
      <McpPage />
    </>
  );
}
