import type { GetServerSideProps } from "next";
import { isSandboxHostRequest, isAppHostRequest, isWorkersDevRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";
import { buildDenyAllRobotsTxt, buildMarketingRobotsTxt } from "../shared/robots";
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

  if (isSandboxHostRequest(req)) {
    // Crawlers must be allowed to read noindex. Do not advertise a sitemap.
    res.setHeader("X-Robots-Tag", "noindex, follow");
    res.write("User-agent: *\nAllow: /\n");
  } else if (isWorkersDev || isAppHost) {
    res.write(buildDenyAllRobotsTxt());
  } else {
    res.write(buildMarketingRobotsTxt(sitemapUrl));
  }
  res.end();

  return { props: {} };
};

export default function RobotsTxt() {
  return null;
}
