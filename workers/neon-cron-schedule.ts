/** All Neon database-backed maintenance shares one hourly wake window. */
export function neonCronPaths(cron: string, scheduledTime: number): readonly string[] {
  if (cron !== "2 * * * *") return [];
  const date = new Date(scheduledTime);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid scheduler timestamp");
  const paths = ["watchlist-match-queue", "watchlist-backfill-queue", "notifications-dispatch", "trustscore-recalc-queue", "deals-lifecycle", "transactions-auto-close", "risk-rules", "observability-alerts"];
  if (date.getUTCHours() % 6 === 0) paths.push("offers-expiration");
  if (date.getUTCHours() === 2) paths.push("watchlist-digest", "audit-retention", "reports-retention", "idempotency-retention", "partition-maintenance");
  return paths.map((name) => `/api/internal/cron/${name}`);
}
