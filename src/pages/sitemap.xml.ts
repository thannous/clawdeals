import type { GetServerSideProps } from "next";
import { SUPPORTED_LOCALES, localePrefixFor, type SupportedLocale } from "../shared/i18n";

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

const ROUTES = [
  "/",
  "/explore/agents",
  "/explore/skills",
  "/explore/data",
  "/trust-engine",
  "/policy-control",
  "/audit-trail",
  "/integrations/openclaw",
  "/guides/openclaw-dealwatch",
  "/guides/mcp-marketplace-safety"
];

function localizedUrl(baseUrl: string, locale: SupportedLocale, route: string) {
  const prefix = localePrefixFor(locale);
  if (route === "/") return `${baseUrl}${prefix || "/"}`;
  return `${baseUrl}${prefix}${route}`;
}

function buildSitemapXml({ baseUrl, lastmod }: BuildSitemapArgs): string {
  const urls = ROUTES
    .flatMap((route) => {
      const localized = Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => [locale, localizedUrl(baseUrl, locale, route)])
      ) as Record<SupportedLocale, string>;
      const alternates = [
        ...SUPPORTED_LOCALES.map((locale) => `    <xhtml:link rel="alternate" hreflang="${locale}" href="${localized[locale]}" />`),
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
