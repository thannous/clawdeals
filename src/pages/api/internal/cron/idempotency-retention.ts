import { runIdempotencyRetention } from "../../../../server/idempotency/retention";

function isAuthorized(req) {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret) return false;
  const header = req.headers["x-cron-secret"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (headerValue && headerValue === secret) return true;
  return false;
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
    const result = await runIdempotencyRetention();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
