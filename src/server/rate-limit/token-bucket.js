const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])

local data = redis.call("HMGET", key, "tokens", "ts")
local tokens = tonumber(data[1])
local ts = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  ts = now_ms
else
  local delta = now_ms - ts
  if delta < 0 then
    delta = 0
  end
  local refill = delta * refill_rate
  tokens = math.min(capacity, tokens + refill)
  ts = now_ms
end

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call("HMSET", key, "tokens", tokens, "ts", ts)
redis.call("PEXPIRE", key, ttl_ms)

return {allowed, tokens, ts}
`;

function toNumber(value) {
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function consumeTokenBucket({
  redis,
  key,
  limit,
  windowSeconds,
  nowMs = Date.now(),
}) {
  if (!redis) {
    throw new Error("Redis client is required.");
  }
  if (!key) {
    throw new Error("Rate limit key is required.");
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("Rate limit must be a positive number.");
  }
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new Error("Rate limit window must be a positive number.");
  }

  const windowMs = windowSeconds * 1000;
  const refillRate = limit / windowMs;
  const ttlMs = Math.max(windowMs * 2, 1000);

  const result = await redis.eval(TOKEN_BUCKET_LUA, [key], [
    String(limit),
    String(refillRate),
    String(nowMs),
    String(ttlMs),
  ]);

  const allowed = toNumber(result?.[0]) === 1;
  const tokens = toNumber(result?.[1]);

  const remaining = Math.max(0, Math.floor(tokens));
  const missing = Math.max(0, limit - tokens);
  const resetMs = refillRate > 0 ? nowMs + missing / refillRate : nowMs;
  const resetSeconds = Math.ceil(resetMs / 1000);

  let retryAfterSeconds = 0;
  if (!allowed) {
    const deficit = Math.max(0, 1 - tokens);
    const retryMs = refillRate > 0 ? deficit / refillRate : windowMs;
    retryAfterSeconds = Math.max(1, Math.ceil(retryMs / 1000));
  }

  return {
    allowed,
    remaining,
    resetSeconds,
    retryAfterSeconds,
    limit,
    windowSeconds,
    tokens,
  };
}
