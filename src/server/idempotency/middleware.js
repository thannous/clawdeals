import { getRedis } from "../redis/upstash";
import { jsonResponse } from "../http/response";
import { errorPayload } from "../http/errors";
import { canonicalJsonStringify } from "../utils/canonical-json";
import {
  buildRequestHmac,
  decryptJson,
  encryptJson,
  shouldEncryptResponseBody
} from "./crypto";
import {
  IDEMPOTENCY_LOCK_TTL_MS,
  IDEMPOTENCY_MAX_KEY_LENGTH,
  IDEMPOTENCY_MAX_WAIT_MS,
  IDEMPOTENCY_TTL_SECONDS
} from "./constants";
import {
  deleteIdempotencyRecord,
  getIdempotencyRecord,
  insertIdempotencyRecord,
  updateIdempotencyRecord
} from "./store";

function getHeaderValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const value = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function isAsciiKey(value) {
  if (typeof value !== "string") return false;
  if (!value.length || value.length > IDEMPOTENCY_MAX_KEY_LENGTH) return false;
  return /^[\x20-\x7E]+$/.test(value);
}

function serializeQuery(query) {
  if (!query || typeof query !== "object") return "";
  const params = new URLSearchParams();
  const entries = Object.entries(query).sort(([a], [b]) => a.localeCompare(b));
  entries.forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, String(entry)));
    } else if (value !== undefined) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

function buildLockKey({ actorType, actorId, method, path, key }) {
  return `idem:lock:${actorType}:${actorId}:${method}:${path}:${key}`;
}

function buildErrorResponse(code, message, details, status = 409, headers = {}) {
  return jsonResponse(status, errorPayload(code, message, details), headers);
}

async function pollForRecord({ actorType, actorId, method, path, key, maxWaitMs }) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const record = await getIdempotencyRecord({ actorType, actorId, method, path, key });
    if (record && (record.status === "COMPLETED" || record.status === "FAILED")) {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

export async function beginIdempotency(req, ctx, options = {}) {
  if (!options.enabled) return { action: "skip" };

  const key = getHeaderValue(req.headers, "idempotency-key");
  if (!key) return { action: "skip" };
  if (!isAsciiKey(key)) {
    return {
      action: "error",
      response: buildErrorResponse(
        "INVALID_IDEMPOTENCY_KEY",
        "Invalid Idempotency-Key",
        { max_length: IDEMPOTENCY_MAX_KEY_LENGTH },
        400
      )
    };
  }

  let actorType = ctx.actor?.type === "owner" ? "owner" : ctx.actor?.type === "agent" ? "agent" : null;
  let actorId = ctx.actor?.id;
  if (!actorId && options.useIpFallback && ctx.ip) {
    actorType = "ip";
    actorId = ctx.ip;
  }
  if (!actorId || !actorType) {
    return { action: "skip" };
  }

  const method = ctx.method;
  const path = ctx.path;
  const canonicalBody = ctx.canonicalBody || canonicalJsonStringify(ctx.body || {});
  const query = serializeQuery(req.query);
  const secret = process.env.IDEMPOTENCY_SECRET;
  if (!secret) {
    throw new Error("IDEMPOTENCY_SECRET is required.");
  }
  const requestHmac = buildRequestHmac({
    secret,
    method,
    path,
    query,
    canonicalBody
  });

  const redis = getRedis();
  const lockKey = buildLockKey({ actorType, actorId, method, path, key });
  const lockTtlMs = options.lockTtlMs || IDEMPOTENCY_LOCK_TTL_MS;
  const lockAcquired = await redis.set(lockKey, "1", { nx: true, px: lockTtlMs });

  if (!lockAcquired) {
    const record = await pollForRecord({
      actorType,
      actorId,
      method,
      path,
      key,
      maxWaitMs: options.maxWaitMs || IDEMPOTENCY_MAX_WAIT_MS
    });

    if (record) {
      return {
        action: "replay",
        response: buildReplayResponse(record),
        context: {
          key,
          requestHmac,
          record,
          replayed: true
        }
      };
    }

    return {
      action: "error",
      response: buildErrorResponse(
        "IDEMPOTENCY_IN_PROGRESS",
        "Request with the same Idempotency-Key is still in progress",
        { retry_after_seconds: 1 },
        409,
        { "Retry-After": "1" }
      )
    };
  }

  const existing = await getIdempotencyRecord({ actorType, actorId, method, path, key });
  if (existing) {
    if (existing.request_hmac !== requestHmac) {
      await redis.del(lockKey);
      return {
        action: "error",
        response: buildErrorResponse(
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency-Key reuse detected",
          {},
          409
        )
      };
    }

    if (existing.status === "COMPLETED" || existing.status === "FAILED") {
      await redis.del(lockKey);
      return {
        action: "replay",
        response: buildReplayResponse(existing),
        context: {
          key,
          requestHmac,
          record: existing,
          replayed: true
        }
      };
    }
  }

  const ttlSeconds = options.ttlSeconds || IDEMPOTENCY_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const record = existing
    ? existing
    : await insertIdempotencyRecord({
        actor_type: actorType,
        actor_id: actorId,
        method,
        path,
        idempotency_key: key,
        request_hmac: requestHmac,
        status: "IN_PROGRESS",
        expires_at: expiresAt
      });

  return {
    action: "continue",
    context: {
      key,
      requestHmac,
      actorType,
      actorId,
      method,
      path,
      lockKey,
      record,
      expiresAt
    }
  };
}

function buildReplayResponse(record) {
  const headers = Object.assign({}, record.response_headers || {}, {
    "Idempotency-Replayed": "true"
  });
  let body = record.response_body || null;
  if (!body && record.response_body_encrypted) {
    try {
      body = decryptJson({
        secret: process.env.IDEMPOTENCY_SECRET,
        payload: record.response_body_encrypted
      });
    } catch (error) {
      return jsonResponse(
        500,
        errorPayload(
          "IDEMPOTENCY_REPLAY_FAILED",
          "Failed to replay idempotent response"
        ),
        headers
      );
    }
  }
  return jsonResponse(record.response_status || 200, body || {}, headers);
}

function shouldPersistStatus(status) {
  if (status === 400 || status === 429) return false;
  return true;
}

export async function finalizeIdempotency(context, result) {
  if (!context || !context.record) return;
  if (!result || typeof result.status !== "number") return;
  const redis = getRedis();
  if (context.lockKey) {
    await redis.del(context.lockKey);
  }

  if (!shouldPersistStatus(result.status)) {
    await deleteIdempotencyRecord(context.record.idempotency_id);
    return;
  }

  const status = result.status >= 500 ? "FAILED" : "COMPLETED";
  const responseHeaders = result.headers || {};

  let responseBody = result.body ?? null;
  let responseBodyEncrypted = null;
  if (responseBody && shouldEncryptResponseBody(responseBody)) {
    responseBodyEncrypted = encryptJson({ secret: process.env.IDEMPOTENCY_SECRET, payload: responseBody });
    responseBody = null;
  }

  await updateIdempotencyRecord(context.record.idempotency_id, {
    status,
    response_status: result.status,
    response_headers: responseHeaders,
    response_body: responseBody,
    response_body_encrypted: responseBodyEncrypted,
    entity_type: result.entityType || null,
    entity_id: result.entityId || null
  });
}
