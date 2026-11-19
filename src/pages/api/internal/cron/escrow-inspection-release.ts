import { runInspectionAutoRelease } from "../../../../server/services/inspection-auto-release";
import { isInternalCronAuthorized } from "../../../../server/internal-cron-auth";

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

  if (!isInternalCronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const limit = parseOptionalInt(req.query?.limit);
    const result = await runInspectionAutoRelease({ ...(limit ? { limit } : {}) });
    const status = result?.failed_count > 0 || result?.skipped ? 503 : 200;
    res.status(status).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
