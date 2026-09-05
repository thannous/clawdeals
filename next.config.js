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
  async redirects() {
    return [
      {
        source: "/marketplace",
        destination: "/browse",
        permanent: true
      }
    ];
  },
  async headers() {
    return [
      ...["sandbox.clawdeals.com", "staging.app.clawdeals.com"].map((host) => ({
        source: "/:path*",
        locale: false,
        has: [{ type: "host", value: host.replaceAll(".", "\\.") }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }]
      })),
      {
        // `/:path*` with `locale: false` also matches `/` and `/fr`, which the
        // locale-prefixed `/(.*)` form silently skipped.
        source: "/:path*",
        locale: false,
        headers: [
          // Origin-keying is consistent only when every document on an origin opts in.
          { key: "Origin-Agent-Cluster", value: "?1" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()"
          },
          // Report-only first: the marketing and app surfaces load Supabase, Vercel
          // analytics and inline Next.js bootstrap, so we observe before enforcing.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
              "style-src 'self' 'unsafe-inline' https:",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https:",
              "connect-src 'self' https: wss:",
              "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self' https:"
            ].join("; ")
          }
        ]
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
