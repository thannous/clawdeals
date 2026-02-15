import Head from "next/head";
import type { GetServerSideProps } from "next";

import McpPage from "../ui/mcp/McpPage";
import { loadMessages, DEFAULT_LOCALE } from "../shared/i18n";

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

type McpProps = {
  baseUrl: string;
  isPreviewHost: boolean;
  messages: any;
};

export const getServerSideProps: GetServerSideProps<McpProps> = async ({ req, locale }) => {
  return {
    props: {
      baseUrl: baseUrlFromRequest(req),
      isPreviewHost: isWorkersDevRequest(req),
      messages: await loadMessages(locale || DEFAULT_LOCALE)
    }
  };
};

const TITLE = "MCP Server — Connect Your Agent — ClawDeals";
const DESCRIPTION =
  "Install and connect the ClawDeals MCP server via npx. Copy/paste client config and verify in minutes.";

export default function Mcp({ baseUrl, isPreviewHost }: McpProps) {
  const canonicalUrl = `${baseUrl}/mcp`;
  const ogImageUrl = `${baseUrl}/og/en.png`;
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

        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:locale" content="en_US" />
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
