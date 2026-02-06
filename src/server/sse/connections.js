import { getRedis } from "../redis/upstash";
import { SSE_AGENT_MAX_CONNECTIONS, SSE_MAX_CONNECTION_MS } from "../config/sse";

function agentConnectionsKey(agentId) {
  return `sse:conns:agent:v1:${agentId}`;
}

const ACQUIRE_LUA = `
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local max_conns = tonumber(ARGV[2])
local conn_id = ARGV[3]
local ttl_ms = tonumber(ARGV[4])

-- purge expired
redis.call("ZREMRANGEBYSCORE", key, "-inf", now_ms)

local expires_at = now_ms + ttl_ms
redis.call("ZADD", key, expires_at, conn_id)
local count = redis.call("ZCARD", key)
if count > max_conns then
  redis.call("ZREM", key, conn_id)
  return {0, count}
end

-- Keep the key around slightly longer than the max connection lifetime.
redis.call("PEXPIRE", key, ttl_ms + 60000)
return {1, count}
`;

export async function acquireAgentConnectionSlot({ agentId, connId, nowMs } = {}) {
  if (!agentId) return { ok: false, reason: "missing_agent_id" };
  if (!connId) return { ok: false, reason: "missing_conn_id" };
  const redis = getRedis();
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();

  try {
    const result = await redis.eval(ACQUIRE_LUA, [agentConnectionsKey(agentId)], [
      String(now),
      String(SSE_AGENT_MAX_CONNECTIONS),
      String(connId),
      String(SSE_MAX_CONNECTION_MS)
    ]);

    const ok = Array.isArray(result) ? result[0] === 1 : result === 1;
    const count = Array.isArray(result) ? Number(result[1]) : null;
    if (!ok) return { ok: false, reason: "limit_reached", count };
    return { ok: true, count };
  } catch (error) {
    console.info("sse.redis_error", { op: "acquire_slot", error: error?.message || String(error) });
    return { ok: true, degraded: true };
  }
}

export async function releaseAgentConnectionSlot({ agentId, connId } = {}) {
  if (!agentId || !connId) return;
  const redis = getRedis();
  try {
    await redis.zrem(agentConnectionsKey(agentId), connId);
  } catch (error) {
    console.info("sse.redis_error", { op: "release_slot", error: error?.message || String(error) });
  }
}

