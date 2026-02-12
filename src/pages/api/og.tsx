import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // X/Twitter is inconsistent with SVG OG images. Keep this endpoint for backward
  // compatibility, but redirect to a PNG served from `public/og/*`.
  const locale = typeof req.query.locale === "string" ? req.query.locale : "en";
  const lang = locale === "fr" ? "fr" : "en";
  const target = `/og/${lang}.png`;

  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
  res.redirect(302, target);
}
