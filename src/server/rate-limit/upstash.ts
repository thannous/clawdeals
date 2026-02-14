import { Redis } from "@upstash/redis";

const redisClients = new Map<string, Redis>();

export function createUpstashRedis({ url, token }: any = {}) {
  if (!url || !token) {
    throw new Error("Upstash Redis url/token missing.");
  }

  const key = `${url}::${token}`;
  const cached = redisClients.get(key);
  if (cached) return cached;

  const client = new Redis({
    url,
    token,
    // Request-path rate limiting should be deterministic and quick.
    retry: false
  });
  redisClients.set(key, client);
  return client;
}

export function resolveUpstashConfig(env?: Record<string, string | undefined>) {
  const processEnv =
    typeof process !== "undefined" && process?.env ? process.env : undefined;
  const source = env || processEnv || {};
  const url = source.UPSTASH_REDIS_REST_URL || source.KV_REST_API_URL;
  const token = source.UPSTASH_REDIS_REST_TOKEN || source.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url, token };
}
