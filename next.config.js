/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  i18n: {
    locales: ["fr", "en"],
    defaultLocale: "en",
    localeDetection: false
  },
  async redirects() {
    return [
      { source: "/en", destination: "/", permanent: true },
      { source: "/en/:path*", destination: "/:path*", permanent: true },
      { source: "/fr/robots.txt", destination: "/robots.txt", permanent: true },
      { source: "/fr/sitemap.xml", destination: "/sitemap.xml", permanent: true }
    ];
  }
};

module.exports = nextConfig;
