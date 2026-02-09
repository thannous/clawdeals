import {
  RATE_LIMIT_DEFAULT_SCOPE,
  RATE_LIMIT_KEY_PREFIX,
  formatLimitLabel,
  getProfileForGroup,
  normalizeKeyPart
} from "./config";
import { createUpstashRedis, resolveUpstashConfig } from "./upstash";
import { consumeTokenBucket } from "./token-bucket";
import { matchRouteGroupFromRequest } from "../routes/route-groups";
import { getNumberEnv } from "../config/env";

function getHeaderValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const value = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveIp(request, explicitIp) {
  if (explicitIp) {
    return explicitIp;
  }
  if (!request) {
    return null;
  }
  const header =
    getHeaderValue(request.headers, "cf-connecting-ip") ||
    getHeaderValue(request.headers, "x-forwarded-for") ||
    getHeaderValue(request.headers, "x-real-ip");
  if (!header) {
    return null;
  }
  return header.split(",")[0].trim() || null;
}

function resolveIdentity(scope, { agentId, ownerId, channelId, ip, useIpFallback }) {
  if (scope === "owner") {
    return ownerId || (useIpFallback ? ip : null);
  }
  if (scope === "agent") {
    return agentId || (useIpFallback ? ip : null);
  }
  if (scope === "channel") {
    return channelId || (useIpFallback ? ip : null);
  }
  if (scope === "ip") {
    return ip || null;
  }
  return null;
}

function buildBucketId(bucket, effectiveLimit) {
  if (bucket.id) {
    return bucket.id;
  }
  return `${effectiveLimit}-${bucket.windowSeconds}`;
}

function buildRateLimitKey({ scope, identifier, group, bucketId }) {
  const safeScope = normalizeKeyPart(scope);
  const safeId = normalizeKeyPart(identifier);
  const safeGroup = normalizeKeyPart(group);
  const safeBucket = normalizeKeyPart(bucketId);
  return `${RATE_LIMIT_KEY_PREFIX}:${safeScope}:${safeId}:${safeGroup}:${safeBucket}`;
}

function buildRateLimitResponse({
  group,
  scope,
  limitLabel,
  retryAfterSeconds,
  remaining,
  resetSeconds,
  limit
}) {
  return {
    status: 429,
    headers: {
      "Retry-After": String(retryAfterSeconds),
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(resetSeconds)
    },
    body: {
      error: {
        code: "RATE_LIMITED",
        message: "Rate limit exceeded",
        details: {
          scope,
          limit: limitLabel,
          retry_after_seconds: retryAfterSeconds
        }
      }
    },
    meta: {
      group,
      scope,
      limit,
      remaining,
      resetSeconds,
      retryAfterSeconds
    }
  };
}

export async function rateLimitMiddleware(request: any, options: any = {}) {
  const group = options.routeGroup || (request ? matchRouteGroupFromRequest(request) : null);

  if (!group) {
    return null;
  }

  const profile = getProfileForGroup(group, options.rateLimits);
  if (!profile || !Array.isArray(profile.buckets) || profile.buckets.length === 0) {
    return null;
  }

  const scope = profile.scope || RATE_LIMIT_DEFAULT_SCOPE;
  const ip = resolveIp(request, options.ip);
  const identity = resolveIdentity(scope, {
    agentId: options.agentId,
    ownerId: options.ownerId,
    channelId: options.channelId,
    ip,
    useIpFallback: options.useIpFallback ?? true
  });

  if (!identity) {
    return null;
  }

  const redisConfig = options.redis ? null : resolveUpstashConfig(options.env);

  if (!options.redis && !redisConfig) {
    return null;
  }

  const redis = options.redis || createUpstashRedis(redisConfig);
  const nowMs = options.nowMs || Date.now();
  const envMultiplier = getNumberEnv("RATE_LIMIT_MULTIPLIER");
  const limitMultiplier =
    typeof options.limitMultiplier === "number"
      ? options.limitMultiplier
      : typeof profile.limitMultiplier === "number"
        ? profile.limitMultiplier
        : typeof envMultiplier === "number"
          ? envMultiplier
          : 1;

  try {
    for (const bucket of profile.buckets) {
      const rawLimit = bucket.limit;
      const effectiveLimit = Math.max(1, Math.floor(rawLimit * limitMultiplier));
      const bucketId = buildBucketId(bucket, effectiveLimit);
      const key = buildRateLimitKey({
        scope,
        identifier: identity,
        group,
        bucketId
      });

      const result = await consumeTokenBucket({
        redis,
        key,
        limit: effectiveLimit,
        windowSeconds: bucket.windowSeconds,
        nowMs
      });

      if (!result.allowed) {
        const limitLabel = formatLimitLabel(effectiveLimit, bucket.windowSeconds);

        const response = buildRateLimitResponse({
          group,
          scope,
          limitLabel,
          retryAfterSeconds: result.retryAfterSeconds,
          remaining: result.remaining,
          resetSeconds: result.resetSeconds,
          limit: effectiveLimit
        });

        if (typeof options.onRateLimited === "function") {
          options.onRateLimited({
            group,
            scope,
            identity,
            limit: effectiveLimit,
            windowSeconds: bucket.windowSeconds,
            retryAfterSeconds: result.retryAfterSeconds,
            remaining: result.remaining,
            resetSeconds: result.resetSeconds
          });
        }

        return response;
      }
    }
  } catch (error) {
    if (options.failOpen ?? true) {
      if (typeof options.onError === "function") {
        options.onError(error);
      }
      return null;
    }
    throw error;
  }

  return {
    status: 200,
    headers: null,
    body: null,
    meta: {
      group,
      scope,
      identity
    }
  };
}
