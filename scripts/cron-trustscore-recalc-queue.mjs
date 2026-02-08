const baseUrl = process.env.CRON_BASE_URL || process.env.SITE_URL || "http://localhost:3000";
const secret = process.env.INTERNAL_CRON_SECRET;

if (!secret) {
  console.error("Missing INTERNAL_CRON_SECRET for trustscore queue cron.");
  process.exit(1);
}

const url = new URL("/api/internal/cron/trustscore-recalc-queue", baseUrl);
const limit = process.env.CRON_TRUSTSCORE_QUEUE_LIMIT;

if (limit) url.searchParams.set("limit", limit);

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
  console.error("Trustscore queue cron failed", error);
  process.exit(1);
});

