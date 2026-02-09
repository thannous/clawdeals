const baseUrl = process.env.CRON_BASE_URL || process.env.SITE_URL || "http://localhost:3000";
const secret = process.env.INTERNAL_CRON_SECRET;

if (!secret) {
  console.error("Missing INTERNAL_CRON_SECRET for watchlist backfill queue cron.");
  process.exit(1);
}

const url = new URL("/api/internal/cron/watchlist-backfill-queue", baseUrl);

const limit = process.env.CRON_WATCHLIST_BACKFILL_LIMIT;
const dealsLimit = process.env.CRON_WATCHLIST_BACKFILL_DEALS_LIMIT;
const listingsLimit = process.env.CRON_WATCHLIST_BACKFILL_LISTINGS_LIMIT;

if (limit) url.searchParams.set("limit", limit);
if (dealsLimit) url.searchParams.set("deals_limit", dealsLimit);
if (listingsLimit) url.searchParams.set("listings_limit", listingsLimit);

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
  console.error("Watchlist backfill queue cron failed", error);
  process.exit(1);
});

