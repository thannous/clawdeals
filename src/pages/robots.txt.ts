import type { GetServerSideProps } from "next";
import { isAppHostRequest, isWorkersDevRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";

const DEFAULT_SITEMAP_PATH = "/sitemap.xml";

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const baseUrl = marketingBaseUrlFromRequest(req);
  const sitemapUrl = `${baseUrl.replace(/\/$/, "")}${DEFAULT_SITEMAP_PATH}`;
  const isWorkersDev = isWorkersDevRequest(req);
  const isAppHost = isAppHostRequest(req);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");

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
