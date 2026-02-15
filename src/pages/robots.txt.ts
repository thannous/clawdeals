import type { GetServerSideProps } from "next";
import { isAppHostRequest, isWorkersDevRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";
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

  if (isWorkersDev || isAppHost) {
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
