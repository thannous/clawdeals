import { withQueueDrainLease } from "../../../../server/services/queue-drain";
import { runTrustScoreRecalcQueue } from "../../../../server/trustscore/recalc-queue";
import { isQueueDispatchAuthorized } from "../../../../server/internal-cron-auth";

export const config = { maxDuration: 60 };

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

  if (!isQueueDispatchAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const limit = parseOptionalInt(req.query?.limit);
    const result = await withQueueDrainLease("trustscore-recalc-queue", () => runTrustScoreRecalcQueue({
      ...(limit ? { limit } : {})
    }));
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
