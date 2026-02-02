function baseUrlFromRequest(req) {
  const configured = process.env.SITE_URL;
  if (configured && typeof configured === "string" && configured.startsWith("http")) return configured.replace(/\/$/, "");

  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  if (!host) return "https://www.clawdeals.com";
  return `${proto}://${host}`.replace(/\/$/, "");
}

function buildSitemapXml({ baseUrl, lastmod }) {
  const en = `${baseUrl}/`;
  const fr = `${baseUrl}/fr`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${en}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${en}" />
    <xhtml:link rel="alternate" hreflang="fr" href="${fr}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />
  </url>
  <url>
    <loc>${fr}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${en}" />
    <xhtml:link rel="alternate" hreflang="fr" href="${fr}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />
  </url>
</urlset>
`;
}

export async function getServerSideProps({ req, res }) {
  const baseUrl = baseUrlFromRequest(req);
  const lastmod = new Date().toISOString();

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");

  res.write(buildSitemapXml({ baseUrl, lastmod }));
  res.end();

  return { props: {} };
}

export default function SitemapXml() {
  return null;
}

