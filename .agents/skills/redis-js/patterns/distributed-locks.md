# Distributed Locks

Use an expiring lock to coordinate concurrent work, not to claim durable deduplication or exactly-once execution. If A's lease expires and B acquires the key, A must not delete B's lock: use a unique ownership token and atomic compare-and-delete.

Lease expiry can allow concurrent work before the first holder finishes. Choose a renewal/fencing or transactional strategy appropriate to the protected operation; the ownership check below prevents accidental unlock, not work continuing beyond its lease. Use persisted idempotency records for webhook completion so later retries do not repeat completed work.

## Ownership-safe release example

```typescript
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Lock with unique token (prevents accidental unlock by others)
async function acquireLockWithToken(lockKey: string, token: string, ttl: number = 10) {
  const acquired = await redis.set(lockKey, token, { nx: true, ex: ttl });
  return acquired === "OK";
}

async function releaseLockWithToken(lockKey: string, token: string) {
  // Only delete if token matches (using Lua script)
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  return await redis.eval<number>(script, [lockKey], [token]);
}

// Usage with token
async function processWithTokenLock(jobId: string) {
  const lockKey = `lock:job:${jobId}`;
  const token = crypto.randomUUID();

  const acquired = await acquireLockWithToken(lockKey, token, 30);

  if (!acquired) return;

  try {
    await performJobWork(jobId);
  } finally {
    await releaseLockWithToken(lockKey, token);
  }
}
```

`performJobWork` is application-specific. Do not copy an unconditional `DEL` release or treat lock contention as proof that a webhook was already processed. Validate concurrency and lease-expiry behavior in an isolated test environment before production use.
