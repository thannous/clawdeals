import Head from "next/head";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";

import McpPage from "../ui/mcp/McpPage";
import { loadMessages, DEFAULT_LOCALE, resolveSupportedLocale, type SupportedLocale } from "../shared/i18n";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";
import { buildLocaleUrls, hrefLangTags, ogLocaleTags } from "../shared/seo";

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

const TITLE = "MCP Server — Connect Your Agent — ClawDeals";
const DESCRIPTION =
  "Install and connect the ClawDeals MCP server via npx. Copy/paste client config and verify in minutes.";

export default function Mcp({ baseUrl, isPreviewHost }: McpProps) {
  const router = useRouter();
  const locale: SupportedLocale = resolveSupportedLocale(router.locale);
  const urls = buildLocaleUrls(baseUrl, "mcp");
  const canonicalUrl = urls[locale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(locale);
  const ogImageUrl = `${baseUrl}/og/${locale === "fr" ? "fr" : "en"}.png`;
  const robotsContent = isPreviewHost
    ? "noindex,follow"
    : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

  return (
    <>
      <Head>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="robots" content={robotsContent} />
        <link rel="canonical" href={canonicalUrl} />
        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}

        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
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
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={ogImageUrl} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "SoftwareApplication",
                  "@id": canonicalUrl,
                  name: "ClawDeals MCP Server",
                  applicationCategory: "DeveloperApplication",
                  operatingSystem: "Any",
                  description: DESCRIPTION,
                  url: canonicalUrl,
                  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                  isPartOf: { "@id": `${baseUrl}/#website` }
                },
                {
                  "@type": "BreadcrumbList",
                  itemListElement: [
                    { "@type": "ListItem", position: 1, name: "ClawDeals", item: baseUrl },
                    { "@type": "ListItem", position: 2, name: "MCP Server", item: canonicalUrl }
                  ]
                }
              ]
            })
          }}
        />
      </Head>
      <McpPage />
    </>
  );
}
