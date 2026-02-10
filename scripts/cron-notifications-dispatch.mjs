const baseUrl = process.env.CRON_BASE_URL || process.env.SITE_URL || "http://localhost:3000";
const secret = process.env.INTERNAL_CRON_SECRET;

if (!secret) {
  console.error("Missing INTERNAL_CRON_SECRET for notifications dispatch cron.");
  process.exit(1);
}

const url = new URL("/api/internal/cron/notifications-dispatch", baseUrl);

const dryRun = process.env.CRON_NOTIF_DRY_RUN;
const limitOwners = process.env.CRON_NOTIF_LIMIT_OWNERS;
const maxItemsPerOwner = process.env.CRON_NOTIF_MAX_ITEMS_PER_OWNER;
const maxItemsPerDigest = process.env.CRON_NOTIF_MAX_ITEMS_PER_DIGEST;

if (dryRun) url.searchParams.set("dry_run", "1");
if (limitOwners) url.searchParams.set("limit_owners", limitOwners);
if (maxItemsPerOwner) url.searchParams.set("max_items_per_owner", maxItemsPerOwner);
if (maxItemsPerDigest) url.searchParams.set("max_items_per_digest", maxItemsPerDigest);

async function run() {
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": secret
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Cron failed: ${response.status} ${text}`);
  }

  console.log(text);
}

run().catch((error) => {
  console.error("Notifications dispatch cron failed", error);
  process.exit(1);
});

