import type { GetServerSideProps } from "next";
import { SEO_SITEMAP_ROUTES } from "../content/seo-routes";
import { SUPPORTED_LOCALES, localePrefixFor, type SupportedLocale } from "../shared/i18n";
import { isAppHostRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";
import { appendVaryHeaders } from "../shared/response-headers";
import { hrefLangFor } from "../shared/seo";

type BuildSitemapArgs = {
  baseUrl: string;
};

const SEO_PROXY_VARY_HEADERS = ["x-edge-router-proxy", "x-forwarded-host", "x-forwarded-proto", "host"];

function localizedUrl(baseUrl: string, locale: SupportedLocale, route: string) {
  const prefix = localePrefixFor(locale);
  if (route === "/") return `${baseUrl}${prefix || "/"}`;
  return `${baseUrl}${prefix}${route}`;
}

export function buildSitemapXml({ baseUrl }: BuildSitemapArgs): string {
  const urls = SEO_SITEMAP_ROUTES
    .flatMap(({ path, lastmod }) => {
      const localized = Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => [locale, localizedUrl(baseUrl, locale, path)])
      ) as Record<SupportedLocale, string>;
      const alternates = [
        ...SUPPORTED_LOCALES.map((locale) => `    <xhtml:link rel="alternate" hreflang="${hrefLangFor(locale)}" href="${localized[locale]}" />`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${localized.en}" />`
      ].join("\n");
      return SUPPORTED_LOCALES.map(
        (locale) => `  <url>
    <loc>${localized[locale]}</loc>
    <lastmod>${lastmod}</lastmod>
${alternates}
  </url>`
      );
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const isAppHost = isAppHostRequest(req);

  if (isAppHost) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("Not found");
    return { props: {} };
  }

  const baseUrl = marketingBaseUrlFromRequest(req);

  appendVaryHeaders(res, SEO_PROXY_VARY_HEADERS);
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");

  res.write(buildSitemapXml({ baseUrl }));
  res.end();

  return { props: {} };
};

export default function SitemapXml() {
  return null;
}
