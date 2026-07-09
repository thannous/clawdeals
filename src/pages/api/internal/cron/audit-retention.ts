import { runAuditRetention } from "../../../../server/audit/retention";
import { isInternalCronAuthorized } from "../../../../server/internal-cron-auth";

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
    const result = await runAuditRetention();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
