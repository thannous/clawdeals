const baseUrl = process.env.CRON_BASE_URL || process.env.SITE_URL || "http://localhost:3000";
const secret = process.env.INTERNAL_CRON_SECRET;

if (!secret) {
  console.error("Missing INTERNAL_CRON_SECRET for watchlist digest cron.");
  process.exit(1);
}

const url = new URL("/api/internal/cron/watchlist-digest", baseUrl);

const limitRows = process.env.CRON_WATCHLIST_DIGEST_LIMIT_ROWS;
const maxEntitiesPerAgent = process.env.CRON_WATCHLIST_DIGEST_MAX_ENTITIES_PER_AGENT;

if (limitRows) url.searchParams.set("limit_rows", limitRows);
if (maxEntitiesPerAgent) url.searchParams.set("max_entities_per_agent", maxEntitiesPerAgent);

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
  console.error("Watchlist digest cron failed", error);
  process.exit(1);
});

