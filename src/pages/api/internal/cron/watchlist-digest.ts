import { runWatchlistDigest } from "../../../../server/services/watchlist-digest";
import { isInternalCronAuthorized } from "../../../../server/internal-cron-auth";

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

  if (!isInternalCronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const limitRows = parseOptionalInt(req.query?.limit_rows);
    const maxEntitiesPerAgent = parseOptionalInt(req.query?.max_entities_per_agent);

    const result = await runWatchlistDigest({
      ...(limitRows ? { limitRows } : {}),
      ...(maxEntitiesPerAgent ? { maxEntitiesPerAgent } : {})
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
