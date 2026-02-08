import { runTrustScoreRecalcQueue } from "../../../../server/trustscore/recalc-queue";

function isAuthorized(req: any) {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret) return false;
  const header = req.headers["x-cron-secret"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (headerValue && headerValue === secret) return true;
  const querySecret = req.query?.secret;
  if (querySecret && querySecret === secret) return true;
  const allowVercelCron = process.env.ALLOW_VERCEL_CRON_USER_AGENT === "true";
  if (allowVercelCron) {
    const userAgent = req.headers["user-agent"] || "";
    if (String(userAgent).includes("vercel-cron/1.0")) return true;
  }
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
    const result = await runTrustScoreRecalcQueue({
      ...(limit ? { limit } : {})
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

