import { Redis } from "@upstash/redis";
import { getNumberEnv } from "../config/env";

let redisClient;

function resolveUpstashTimeoutMs() {
  // Redis is used in request paths (auth cache, SSE, idempotency, etc.). Avoid long hangs
  // when DNS/network is flaky. Keep the default tighter in dev.
  const defaultTimeoutMs = process.env.NODE_ENV === "development" ? 500 : 2000;
  try {
    const raw = getNumberEnv("UPSTASH_REDIS_TIMEOUT_MS", { defaultValue: defaultTimeoutMs });
    const n = Number.isFinite(raw) ? Math.floor(raw) : defaultTimeoutMs;
    // Allow disabling timeouts with 0/negative for debugging.
    return n <= 0 ? 0 : n;
  } catch (error) {
    console.warn("[redis] invalid UPSTASH_REDIS_TIMEOUT_MS; using default", error);
    return defaultTimeoutMs;
  }
}

export function getRedis() {
  if (!redisClient) {
    const timeoutMs = resolveUpstashTimeoutMs();
    const signalFactory =
      timeoutMs > 0 && typeof AbortSignal !== "undefined" && typeof (AbortSignal as any).timeout === "function"
        ? () => (AbortSignal as any).timeout(timeoutMs)
        : undefined;

    redisClient = Redis.fromEnv({
      // This is an infra dependency. Avoid retry backoff on request paths; callers decide
      // whether to fail open/closed.
      retry: false,
      // Create a per-request AbortSignal so a single aborted command doesn't poison the client.
      signal: signalFactory
    });
  }
  return redisClient;
}
