import { runNotificationsDispatch } from "../../../../server/services/notifications-dispatch";
import { isInternalCronAuthorized } from "../../../../server/internal-cron-auth";

function parseOptionalInt(value: any) {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseOptionalBool(value: any) {
  if (!value) return false;
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
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
    const dryRun = parseOptionalBool(req.query?.dry_run);
    const limitOwners = parseOptionalInt(req.query?.limit_owners);
    const maxItemsPerOwner = parseOptionalInt(req.query?.max_items_per_owner);
    const maxItemsPerDigest = parseOptionalInt(req.query?.max_items_per_digest);

    const result = await runNotificationsDispatch({
      ...(dryRun ? { dryRun: true } : {}),
      ...(limitOwners ? { limitOwners } : {}),
      ...(maxItemsPerOwner ? { maxItemsPerOwner } : {}),
      ...(maxItemsPerDigest ? { maxItemsPerDigest } : {})
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
