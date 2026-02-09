import { runWatchlistBackfillQueue } from "../../../../server/services/watchlist-backfill-queue";

function isAuthorized(req: any) {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret) return false;
  const header = req.headers["x-cron-secret"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (headerValue && headerValue === secret) return true;
  return false;
}

function parseOptionalInt(value: any) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const limit = parseOptionalInt(req.query?.limit);
    const dealsLimit = parseOptionalInt(req.query?.deals_limit);
    const listingsLimit = parseOptionalInt(req.query?.listings_limit);

    const result = await runWatchlistBackfillQueue({
      ...(limit ? { limit } : {}),
      ...(dealsLimit ? { dealsLimit } : {}),
      ...(listingsLimit ? { listingsLimit } : {})
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
