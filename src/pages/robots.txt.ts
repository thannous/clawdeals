import type { GetServerSideProps } from "next";

const DEFAULT_SITEMAP_PATH = "/sitemap.xml";

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  const baseUrl = process.env.SITE_URL || (host ? `${proto}://${host}` : "https://www.clawdeals.com");
  const sitemapUrl = `${baseUrl.replace(/\/$/, "")}${DEFAULT_SITEMAP_PATH}`;
  const isWorkersDev = typeof host === "string" && host.includes(".workers.dev");
  const isAppHost = typeof host === "string" && host.toLowerCase().startsWith("app.");

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
