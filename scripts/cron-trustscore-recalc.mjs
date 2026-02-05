const baseUrl = process.env.CRON_BASE_URL || process.env.SITE_URL || "http://localhost:3000";
const secret = process.env.INTERNAL_CRON_SECRET;

if (!secret) {
  console.error("Missing INTERNAL_CRON_SECRET for trustscore cron.");
  process.exit(1);
}

const url = new URL("/api/internal/cron/trustscore-recalc", baseUrl);
const limit = process.env.CRON_TRUSTSCORE_LIMIT;
const pageSize = process.env.CRON_TRUSTSCORE_PAGE_SIZE;

if (limit) url.searchParams.set("limit", limit);
if (pageSize) url.searchParams.set("page_size", pageSize);

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
  console.error("Trustscore cron failed", error);
  process.exit(1);
});
