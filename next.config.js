const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true"
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Avoid lucide-react barrel import cost by rewriting to per-icon imports at build time.
    optimizePackageImports: ["lucide-react"]
  },
  i18n: {
    locales: ["fr", "en"],
    defaultLocale: "en",
    localeDetection: false
  }
};

module.exports = withBundleAnalyzer(nextConfig);
