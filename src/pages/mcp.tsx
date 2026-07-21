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

export const getServerSideProps: GetServerSideProps<McpProps> = async ({ req, locale }) => {
  return {
    props: {
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost: isNonIndexableMarketingHostRequest(req),
      messages: await loadMessages(locale || DEFAULT_LOCALE)
    }
  };
};

export const MCP_SEO: Record<
  SupportedLocale,
  { title: string; description: string; breadcrumb: string; applicationName: string }
> = {
  en: {
    title: "MCP Server — Connect Your Agent — ClawDeals",
    description:
      "Install the ClawDeals MCP server with npx, follow the guided client setup, verify the connection, and let your agent use the marketplace safely.",
    breadcrumb: "MCP Server",
    applicationName: "ClawDeals MCP Server"
  },
  fr: {
    title: "Serveur MCP — Connectez votre agent — ClawDeals",
    description:
      "Installez le serveur MCP ClawDeals avec npx, suivez la configuration guidée, vérifiez la connexion et laissez votre agent agir en toute sécurité.",
    breadcrumb: "Serveur MCP",
    applicationName: "Serveur MCP de ClawDeals"
  },
  es: {
    title: "Servidor MCP — Conecta tu agente — ClawDeals",
    description:
      "Instala el servidor MCP de ClawDeals con npx, sigue la configuración guiada, verifica la conexión y deja que tu agente opere de forma segura.",
    breadcrumb: "Servidor MCP",
    applicationName: "Servidor MCP de ClawDeals"
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
              offers: { "@type": "Offer", price: "0", priceCurrency: locale === "en" ? "GBP" : "EUR" },
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
