import type { GetServerSideProps } from "next";

function baseUrlFromRequest(req: any): string {
  const configured = process.env.SITE_URL;
  if (configured && typeof configured === "string" && configured.startsWith("http")) return configured.replace(/\/$/, "");

  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  if (!host) return "https://clawdeals.com";
  return `${proto}://${host}`.replace(/\/$/, "");
}

type BuildSitemapArgs = {
  baseUrl: string;
  lastmod: string;
};

function buildSitemapXml({ baseUrl, lastmod }: BuildSitemapArgs): string {
  const pages = [
    { en: `${baseUrl}/`, fr: `${baseUrl}/fr` },
    { en: `${baseUrl}/explore/agents`, fr: `${baseUrl}/fr/explore/agents` },
    { en: `${baseUrl}/explore/skills`, fr: `${baseUrl}/fr/explore/skills` },
    { en: `${baseUrl}/explore/data`, fr: `${baseUrl}/fr/explore/data` },
    { en: `${baseUrl}/trust-engine`, fr: `${baseUrl}/fr/trust-engine` },
    { en: `${baseUrl}/policy-control`, fr: `${baseUrl}/fr/policy-control` },
    { en: `${baseUrl}/audit-trail`, fr: `${baseUrl}/fr/audit-trail` },
    { en: `${baseUrl}/integrations/openclaw`, fr: `${baseUrl}/fr/integrations/openclaw` },
    { en: `${baseUrl}/guides/openclaw-dealwatch`, fr: `${baseUrl}/fr/guides/openclaw-dealwatch` },
    { en: `${baseUrl}/guides/mcp-marketplace-safety`, fr: `${baseUrl}/fr/guides/mcp-marketplace-safety` }
  ];

  const urls = pages
    .flatMap(({ en, fr }) => [
      `  <url>
    <loc>${en}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${en}" />
    <xhtml:link rel="alternate" hreflang="fr" href="${fr}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />
  </url>`,
      `  <url>
    <loc>${fr}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${en}" />
    <xhtml:link rel="alternate" hreflang="fr" href="${fr}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />
  </url>`
    ])
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  const isAppHost = typeof host === "string" && host.toLowerCase().startsWith("app.");

  if (isAppHost) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("Not found");
    return { props: {} };
  }

  const baseUrl = baseUrlFromRequest(req);
  // Use build timestamp for stable lastmod; falls back to deploy time or a fixed date
  const lastmod =
    process.env.NEXT_PUBLIC_BUILD_TIME ||
    process.env.NEXT_PUBLIC_DEPLOY_SHA
      ? new Date().toISOString().split("T")[0]
      : "2025-01-01";

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");

  res.write(buildSitemapXml({ baseUrl, lastmod }));
  res.end();

  return { props: {} };
};

export default function SitemapXml() {
  return null;
}
