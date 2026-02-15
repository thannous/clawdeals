const MARKETING_DISALLOW_RULES = [
  "/api/",
  "/console/",
  "/developer/",
  "/settings/",
  "/auth/",
  "/pair",
  "/start",
  "/claim/",
  "/device",
  "/dev/"
];

export function buildDenyAllRobotsTxt(): string {
  return ["User-agent: *", "Disallow: /", ""].join("\n");
}

export function buildMarketingRobotsTxt(sitemapUrl: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    "Allow: /api/og",
    ...MARKETING_DISALLOW_RULES.map((rule) => `Disallow: ${rule}`),
    "",
    `Sitemap: ${sitemapUrl}`,
    ""
  ].join("\n");
}
