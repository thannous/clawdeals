import type { GetServerSideProps } from "next";
import { isAppHostRequest, isWorkersDevRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";
import { appendVaryHeaders } from "../shared/response-headers";

const DEFAULT_SITEMAP_PATH = "/sitemap.xml";
const SEO_PROXY_VARY_HEADERS = ["x-edge-router-proxy", "x-forwarded-host", "x-forwarded-proto", "host"];

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const baseUrl = marketingBaseUrlFromRequest(req);
  const sitemapUrl = `${baseUrl.replace(/\/$/, "")}${DEFAULT_SITEMAP_PATH}`;
  const isWorkersDev = isWorkersDevRequest(req);
  const isAppHost = isAppHostRequest(req);

  appendVaryHeaders(res, SEO_PROXY_VARY_HEADERS);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=300");

  if (isWorkersDev || isAppHost) {
    res.write(`User-agent: *\nDisallow: /\n`);
  } else {
    res.write(
      [
        "User-agent: *",
        "Allow: /",
        "",
        "Allow: /api/og",
        "Disallow: /api/",
        "Disallow: /console/",
        "Disallow: /developer/",
        "Disallow: /settings/",
        "Disallow: /auth/",
        "Disallow: /pair",
        "Disallow: /start",
        "Disallow: /claim/",
        "Disallow: /device",
        "Disallow: /dev/",
        "",
        `Sitemap: ${sitemapUrl}`,
        ""
      ].join("\n")
    );
  }
  res.end();

  return { props: {} };
};

export default function RobotsTxt() {
  return null;
}
