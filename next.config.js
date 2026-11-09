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

// Only the non-secret database selector is exposed, never connection settings.
// Mirror the server default/normalization and reject contradictory public input.
const databaseBackend = String(process.env.CLAWDEALS_DATABASE_BACKEND || "").trim().toLowerCase() || "supabase";
if (!["supabase", "neon"].includes(databaseBackend)) {
  throw new Error("CLAWDEALS_DATABASE_BACKEND must be supabase or neon");
}
const publicDatabaseBackend = String(process.env.NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND || "").trim().toLowerCase();
if (publicDatabaseBackend && publicDatabaseBackend !== databaseBackend) {
  throw new Error("NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND must match CLAWDEALS_DATABASE_BACKEND");
}
const rehearsalValue = String(process.env.CLAWDEALS_REHEARSAL_MODE || "").trim().toLowerCase();
const rehearsalBuild = Boolean(rehearsalValue && rehearsalValue !== "false" && rehearsalValue !== "0");
if (rehearsalBuild && process.env.NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND !== "neon") {
  throw new Error("Rehearsal build requires NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND=neon");
}
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND: databaseBackend,
    NEXT_PUBLIC_CLAWDEALS_REHEARSAL_MODE: rehearsalBuild ? "true" : "false"
  },
  reactStrictMode: true,
  // The root Proxy needs the original URL to distinguish explicit /en from /.
  skipProxyUrlNormalize: true,
  async redirects() {
    return [
      ...require("./config/host-redirects").hostRedirects(),
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
    optimizePackageImports: ["lucide-react"],
    // dev-only, agents draft Next.js issue reports for human review, nothing sent without Send
    agentFeedback: true
  },
  i18n: {
    locales: ["en", "fr", "es"],
    defaultLocale: "en",
    localeDetection: false
  }
};

module.exports = withBundleAnalyzer(nextConfig);
