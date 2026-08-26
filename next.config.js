let withBundleAnalyzer = (config) => config;
try {
  withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true"
  });
} catch (error) {
  // Bundle analyzer is an optional dependency; builds should still work without it
  // unless explicitly requested via ANALYZE=true.
  if (process.env.ANALYZE === "true") {
    throw error;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Origin-keying is consistent only when every document on an origin opts in.
        source: "/(.*)",
        headers: [{ key: "Origin-Agent-Cluster", value: "?1" }]
      }
    ];
  },
  // Cloudflare/OpenNext can intermittently fail to resolve Turbopack externalized
  // packages (e.g. "zod-<hash>"). Bundle Pages Router deps to avoid runtime 500s.
  bundlePagesRouterDependencies: true,
  experimental: {
    // Avoid lucide-react barrel import cost by rewriting to per-icon imports at build time.
    optimizePackageImports: ["lucide-react"]
  },
  i18n: {
    locales: ["en", "fr", "es"],
    defaultLocale: "en",
    localeDetection: false
  }
};

module.exports = withBundleAnalyzer(nextConfig);
