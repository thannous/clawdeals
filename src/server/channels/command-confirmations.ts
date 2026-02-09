import { getNumberEnv } from "../config/env";
import { getRedis } from "../redis/upstash";

const DEFAULT_TTL_SECONDS = 600;

const CONSUME_CONFIRMATION_LUA = `
local key = KEYS[1]
local v = redis.call("GET", key)
if v then
  redis.call("DEL", key)
end
return v
`;

export function getChannelConfirmationTtlSeconds() {
  return getNumberEnv("CHANNEL_CONFIRMATION_TTL_SECONDS", { defaultValue: DEFAULT_TTL_SECONDS }) ?? DEFAULT_TTL_SECONDS;
}

export function buildConfirmationKey({
  channelIdentityId,
  action,
  targetId
}: {
  channelIdentityId: string;
  action: string;
  targetId: string;
}) {
  return `chan:confirm:${channelIdentityId}:${action}:${targetId}`;
}

export async function createConfirmation({
  channelIdentityId,
  action,
  targetId,
  payload,
  ttlSeconds = getChannelConfirmationTtlSeconds()
}: any) {
  const key = buildConfirmationKey({ channelIdentityId, action, targetId });
  const redis = getRedis();
  const value = JSON.stringify(payload || {});
  const result = await redis.set(key, value, { nx: true, ex: ttlSeconds });
  return { ok: Boolean(result), key };
}

export async function getConfirmation({ channelIdentityId, action, targetId }: any) {
  const key = buildConfirmationKey({ channelIdentityId, action, targetId });
  const redis = getRedis();
  const raw = await redis.get(key);
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function consumeConfirmation({ channelIdentityId, action, targetId }: any) {
  const key = buildConfirmationKey({ channelIdentityId, action, targetId });
  const redis = getRedis();
  let raw: any = null;
  try {
    // Atomic: avoids double-consume under retries/races.
    raw = await redis.eval(CONSUME_CONFIRMATION_LUA, [key], []);
  } catch (error) {
    // Fallback to non-atomic behavior if Redis/EVAL is unavailable.
    raw = await redis.get(key);
    if (raw) {
      await redis.del(key);
    }
  }
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
