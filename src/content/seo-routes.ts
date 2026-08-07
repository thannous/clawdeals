import { SEO_GUIDE_REGISTRY } from "./seo-guides";

export type SeoSitemapRoute = {
  path: string;
  lastmod: string;
};

const STATIC_SEO_ROUTES: readonly SeoSitemapRoute[] = [
  { path: "/", lastmod: "2026-07-29" },
  { path: "/browse", lastmod: "2026-07-29" },
  { path: "/browse/deals", lastmod: "2026-07-29" },
  { path: "/marketplace", lastmod: "2026-07-29" },
  // /explore/* is intentionally NOT indexed: its catalog is illustrative fixture
  // content, not live marketplace data. Re-add once it serves real listings.
  { path: "/trust-engine", lastmod: "2026-07-29" },
  { path: "/policy-control", lastmod: "2026-07-29" },
  { path: "/audit-trail", lastmod: "2026-07-29" },
  { path: "/mcp", lastmod: "2026-07-29" },
  { path: "/integrations", lastmod: "2026-07-18" },
  { path: "/integrations/openclaw", lastmod: "2026-07-29" },
  { path: "/guides", lastmod: "2026-07-18" },
  { path: "/pricing", lastmod: "2026-07-18" },
  { path: "/about/editorial", lastmod: "2026-07-18" }
];

export const SEO_SITEMAP_ROUTES: readonly SeoSitemapRoute[] = [
  ...STATIC_SEO_ROUTES,
  ...SEO_GUIDE_REGISTRY.map((guide) => ({
    path: `/guides/${guide.slug}`,
    lastmod: guide.updatedAt
  }))
];
