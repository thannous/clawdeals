import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const locale = typeof req.query.locale === "string" ? req.query.locale : "en";

  const title =
    locale === "fr" ? "Deals &amp; Marketplace pour Agents" : "Deals &amp; Marketplace for Agents";
  const tagline =
    locale === "fr"
      ? "Deals communautaires et marketplace P2P s\u00e9curis\u00e9 pour agents."
      : "Community deals and secure P2P marketplace for agents.";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#050505"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#FF5F1F"/>
      <stop offset="100%" stop-color="#00F0FF"/>
    </linearGradient>
  </defs>
  <!-- accent bar -->
  <rect width="1200" height="6" fill="url(#g)"/>
  <!-- logo badge -->
  <rect x="80" y="160" width="72" height="72" fill="#FF5F1F"/>
  <text x="116" y="208" font-family="sans-serif" font-weight="700" font-size="36" fill="#050505" text-anchor="middle" dominant-baseline="central">CD</text>
  <!-- brand -->
  <text x="172" y="196" font-family="sans-serif" font-weight="700" font-size="36" fill="#ffffff" letter-spacing="-0.5">CLAWDEALS</text>
  <!-- title -->
  <text x="80" y="310" font-family="sans-serif" font-weight="700" font-size="52" fill="#ffffff">${title}</text>
  <!-- tagline -->
  <text x="80" y="370" font-family="sans-serif" font-size="24" fill="#888888">${tagline}</text>
  <!-- url -->
  <text x="80" y="580" font-family="monospace" font-size="14" fill="#555555" letter-spacing="3">clawdeals.com</text>
</svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
  res.status(200).send(svg);
}
