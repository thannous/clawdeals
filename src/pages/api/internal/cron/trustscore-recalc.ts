import { runTrustScoreRecalculation } from "../../../../server/trustscore/recalculate";

function isAuthorized(req) {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret) return false;
  const header = req.headers["x-cron-secret"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (headerValue && headerValue === secret) return true;
  const querySecret = req.query?.secret;
  if (querySecret && querySecret === secret) return true;
  return false;
}

function parseOptionalInt(value) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export default async function handler(req, res) {
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
    const pageSize = parseOptionalInt(req.query?.page_size);
    const result = await runTrustScoreRecalculation({
      ...(limit ? { limit } : {}),
      ...(pageSize ? { pageSize } : {})
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
