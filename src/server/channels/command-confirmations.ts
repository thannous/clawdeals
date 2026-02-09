import { getNumberEnv } from "../config/env";
import { getRedis } from "../redis/upstash";

const DEFAULT_TTL_SECONDS = 600;

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
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function consumeConfirmation({ channelIdentityId, action, targetId }: any) {
  const key = buildConfirmationKey({ channelIdentityId, action, targetId });
  const redis = getRedis();
  const raw = await redis.get(key);
  if (!raw || typeof raw !== "string") return null;
  await redis.del(key);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

