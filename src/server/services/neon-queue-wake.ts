import { assertRehearsalEffectAllowed } from "../config/rehearsal";
import { AsyncLocalStorage } from "node:async_hooks";
import { getDeadline, waitUntil } from "@vercel/functions";
import { ensureNeonRuntimeRole, getNeonSql } from "../db/neon";

const QUEUES = ["watchlist-match-queue", "watchlist-backfill-queue", "trustscore-recalc-queue", "notifications-dispatch"];
const suppressed = new AsyncLocalStorage<boolean>();
export function withoutNeonQueueWakes<T>(work: () => Promise<T>) { return suppressed.run(true, work); }
function platformHost(value: string | undefined) {
  if (!value || !/^[a-z0-9.-]+$/i.test(value) || value.includes("..")) throw new Error("Missing or invalid deployment identity");
  return new URL(`https://${value}`).origin;
}
/** Only server config and platform identities may select a secret destination. */
export function resolveNeonQueueOrigin(env: NodeJS.ProcessEnv = process.env): string {
  if (env.VERCEL !== "1" || !["preview", "production"].includes(env.VERCEL_ENV || "")) throw new Error("Vercel request runtime required");
  const deployment = platformHost(env.VERCEL_URL);
  if (!env.CLAWDEALS_QUEUE_WAKE_ORIGIN) throw new Error("Explicit queue origin required");
  const origin = new URL(env.CLAWDEALS_QUEUE_WAKE_ORIGIN);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" || origin.port) throw new Error("Invalid queue origin");
  const allowed = new Set([deployment]);
  if (env.VERCEL_BRANCH_URL) allowed.add(platformHost(env.VERCEL_BRANCH_URL));
  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) allowed.add(platformHost(env.VERCEL_PROJECT_PRODUCTION_URL));
  if (!allowed.has(origin.origin)) throw new Error("Queue origin does not match this deployment");
  if (env.VERCEL_ENV === "preview" && env.VERCEL_PROJECT_PRODUCTION_URL && origin.origin === platformHost(env.VERCEL_PROJECT_PRODUCTION_URL)) throw new Error("Preview queue origin points at production");
  return origin.origin;
}
async function dispatchPendingQueues(origin: string, secret: string, timeout: number) {
  assertRehearsalEffectAllowed("services/neon-queue-wake");
  const signal = AbortSignal.timeout(timeout);
  await ensureNeonRuntimeRole();
  signal.throwIfAborted();
  const rows = await getNeonSql().query("SELECT public.claim_neon_queue_wakes_v1() AS queues", [], { fetchOptions: { signal } });
  const queues = rows[0]?.queues;
  if (!Array.isArray(queues) || queues.length > 4 || queues.some((queue) => !QUEUES.includes(queue))) throw new Error("Invalid wake claim");
  const results = await Promise.allSettled([...new Set(queues)].map(async (queue) => {
    const response = await fetch(new URL(`/api/internal/cron/${queue}`, origin), {
      method: "POST", redirect: "error",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: "{}", signal
    });
    // No immediate retry, production fallback or deployment-protection bypass.
    if (!response.ok) throw new Error("Queue dispatch rejected");
  }));
  if (results.some((result) => result.status === "rejected")) throw new Error("Queue dispatch incomplete");
}
/** Register only after commit. Invocation lifetime is not durable scheduling. */
export async function wakeNeonQueuesAfterCommit() {
  assertRehearsalEffectAllowed("services/neon-queue-wake");
  if (suppressed.getStore() || !process.env.CLAWDEALS_QUEUE_WAKE_ORIGIN) return;
  try {
    const origin = resolveNeonQueueOrigin();
    const secret = process.env.QUEUE_DISPATCH_SECRET;
    if (!secret || secret.length < 32) throw new Error("Missing queue dispatch credential");
    const deadline = getDeadline();
    if (!deadline || !Number.isFinite(deadline.getTime())) throw new Error("Request lifetime unavailable");
    const timeout = Math.min(25_000, deadline.getTime() - Date.now() - 1000);
    if (timeout <= 0) throw new Error("Insufficient invocation lifetime");
    let registered = false;
    const task = Promise.resolve().then(async () => {
      if (!registered) return;
      try { await dispatchPendingQueues(origin, secret, timeout); }
      catch { console.warn("queue.neon_wake_unavailable"); }
    });
    waitUntil(task);
    registered = true;
  } catch { console.warn("queue.neon_wake_unavailable"); }
}
