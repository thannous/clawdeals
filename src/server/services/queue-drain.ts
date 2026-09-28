import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient } from "../db/supabase";

type QueueName = "watchlist-match-queue" | "watchlist-backfill-queue" | "trustscore-recalc-queue" | "notifications-dispatch";

export async function withQueueDrainLease<T>(queue: QueueName, work: () => Promise<T>, client: any = getSupabaseServiceClient()) {
  const args = { p_queue: queue, p_token: randomUUID() };
  const claim = await client.rpc("queue_drain_claim_v1", args);
  if (claim.error) throw new Error("Unable to claim queue drain lease");
  if (claim.data !== true) return { ok: true, skipped: "already_running" };
  const started = Date.now();
  try {
    const result = await work();
    const processed = result && typeof result === "object" ? (result as Record<string, unknown>).processed_count : undefined;
    console.info("queue.drain_completed", { queue, duration_ms: Date.now() - started, processed_count: typeof processed === "number" ? processed : null });
    return result;
  } finally {
    try {
      const released = await client.rpc("queue_drain_release_v1", args);
      if (released.error) throw new Error("release unavailable");
    } catch {
      // Do not replay successful work on release failure. The lease expires.
      console.warn("queue.lease_release_failed", { queue });
    }
  }
}
