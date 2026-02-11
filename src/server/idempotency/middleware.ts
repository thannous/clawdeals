import { getRedis } from "../redis/upstash";
import { jsonResponse, type JsonResponse } from "../http/response";
import { errorPayload } from "../http/errors";
import { canonicalJsonStringify } from "../utils/canonical-json";
import crypto from "crypto";
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
  claimExpiredIdempotencyRecord,
  deleteIdempotencyRecord,
  getIdempotencyRecord,
  insertIdempotencyRecord,
  updateIdempotencyRecord
} from "./store";

type AnyJsonResponse = JsonResponse<any>;

export type BeginIdempotencyReplayContext = {
  key: string;
  requestHmac: string;
  record: any;
  replayed: true;
};

export type BeginIdempotencyContinueContext = {
  key: string;
  requestHmac: string;
  actorType: string;
  actorId: string;
  method: string;
  path: string;
  lockKey: string | null;
  record: any;
  expiresAt: string;
};

type BeginIdempotencySkipResult = { action: "skip" };
type BeginIdempotencyErrorResult = { action: "error"; response: AnyJsonResponse };
type BeginIdempotencyReplayResult = {
  action: "replay";
  response: AnyJsonResponse;
  context: BeginIdempotencyReplayContext;
};
type BeginIdempotencyContinueResult = {
  action: "continue";
  context: BeginIdempotencyContinueContext;
};

export type BeginIdempotencyResult =
  | BeginIdempotencySkipResult
  | BeginIdempotencyErrorResult
  | BeginIdempotencyReplayResult
  | BeginIdempotencyContinueResult;

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

function buildRequestFingerprint({ secret, method, path, query, canonicalBody }) {
  const data = `${method}\n${path}\n${query}\n${canonicalBody}`;
  if (secret) {
    return `hmac:${buildRequestHmac({ secret, method, path, query, canonicalBody })}`;
  }
  // Fallback mode: still enforce idempotency semantics without requiring a secret.
  // We intentionally avoid storing the body itself and instead store a stable digest.
  const digest = crypto.createHash("sha256").update(data).digest("hex");
  return `sha256:${digest}`;
}

function isHmacFingerprint(value: any) {
  if (!value || typeof value !== "string") return false;
  return value.startsWith("hmac:");
}

function isSha256Fingerprint(value: any) {
  if (!value || typeof value !== "string") return false;
  return value.startsWith("sha256:");
}

function buildLockKey({ actorType, actorId, method, path, key }) {
  return `idem:lock:${actorType}:${actorId}:${method}:${path}:${key}`;
}

function buildErrorResponse(code, message, details, status = 409, headers = {}) {
  return jsonResponse(status, errorPayload(code, message, details), headers);
}

function buildInProgressResponse() {
  return buildErrorResponse(
    "IDEMPOTENCY_IN_PROGRESS",
    "Request with the same Idempotency-Key is still in progress",
    { retry_after_seconds: 1 },
    409,
    { "Retry-After": "1" }
  );
}

function isRecordExpired(record: any) {
  if (!record?.expires_at) return false;
  const expiresAtMs = Date.parse(String(record.expires_at));
  if (!Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs <= Date.now();
}

function canReplayRecord(record: any, options: any) {
  // Route opt-in: strict replay TTL refuses serving cached responses past expires_at.
  if (options?.strictReplayTtl !== true) return true;
  return !isRecordExpired(record);
}

function tryGetRedisClient() {
  try {
    return getRedis();
  } catch {
    return null;
  }
}

async function tryReleaseLock(redis, lockKey) {
  if (!redis || !lockKey) return;
  try {
    await redis.del(lockKey);
  } catch {
    // Best-effort cleanup only.
  }
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

async function verifyIdempotencyFingerprint({
  record,
  requestHmac,
  secret,
  method,
  path,
  query,
  canonicalBody,
  redis,
  lockKey
}: {
  record: any;
  requestHmac: string;
  secret: string | undefined;
  method: string;
  path: string;
  query: string;
  canonicalBody: string;
  redis: any;
  lockKey: string;
}): Promise<BeginIdempotencyErrorResult | null> {
  // request_hmac is a fingerprint:
  // - legacy values were raw HMAC hex (no prefix)
  // - current values are prefixed: hmac:<hex> or sha256:<hex>
  const existingFp = record?.request_hmac;
  const isLegacy = typeof existingFp === "string" && !existingFp.includes(":");
  if (isLegacy) {
    // Legacy behavior required IDEMPOTENCY_SECRET. If it's missing, we can't safely compare.
    if (!secret) {
      await tryReleaseLock(redis, lockKey);
      return {
        action: "error",
        response: buildErrorResponse(
          "IDEMPOTENCY_MISCONFIGURED",
          "Server missing IDEMPOTENCY_SECRET for idempotency verification",
          {},
          500
        )
      };
    }
    const legacy = buildRequestHmac({ secret, method, path, query, canonicalBody });
    if (existingFp !== legacy) {
      await tryReleaseLock(redis, lockKey);
      return {
        action: "error",
        response: buildErrorResponse("IDEMPOTENCY_KEY_REUSE", "Idempotency-Key reuse detected", {}, 409)
      };
    }
    return null;
  }

  if (isHmacFingerprint(existingFp)) {
    if (!secret) {
      await tryReleaseLock(redis, lockKey);
      return {
        action: "error",
        response: buildErrorResponse(
          "IDEMPOTENCY_MISCONFIGURED",
          "Server missing IDEMPOTENCY_SECRET for idempotency verification",
          {},
          500
        )
      };
    }
    const hmac = buildRequestFingerprint({ secret, method, path, query, canonicalBody });
    if (existingFp !== hmac) {
      await tryReleaseLock(redis, lockKey);
      return {
        action: "error",
        response: buildErrorResponse("IDEMPOTENCY_KEY_REUSE", "Idempotency-Key reuse detected", {}, 409)
      };
    }
    return null;
  }

  if (isSha256Fingerprint(existingFp)) {
    const sha = buildRequestFingerprint({ secret: null, method, path, query, canonicalBody });
    if (existingFp !== sha) {
      await tryReleaseLock(redis, lockKey);
      return {
        action: "error",
        response: buildErrorResponse("IDEMPOTENCY_KEY_REUSE", "Idempotency-Key reuse detected", {}, 409)
      };
    }
    return null;
  }

  if (existingFp !== requestHmac) {
    await tryReleaseLock(redis, lockKey);
    return {
      action: "error",
      response: buildErrorResponse("IDEMPOTENCY_KEY_REUSE", "Idempotency-Key reuse detected", {}, 409)
    };
  }

  return null;
}

export async function beginIdempotency(req: any, ctx: any, options: any = {}): Promise<BeginIdempotencyResult> {
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

  try {
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
    const requestHmac = buildRequestFingerprint({
      secret,
      method,
      path,
      query,
      canonicalBody
    });

    const redis = tryGetRedisClient();
    const lockKey = buildLockKey({ actorType, actorId, method, path, key });
    const lockTtlMs = options.lockTtlMs || IDEMPOTENCY_LOCK_TTL_MS;
    const lockAcquired = redis ? await redis.set(lockKey, "1", { nx: true, px: lockTtlMs }) : null;
    const ttlSeconds = options.ttlSeconds || IDEMPOTENCY_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    // Without Redis, we rely on the DB unique index to prevent multiple leaders per (actor, method, path, key).
    if (redis && !lockAcquired) {
      const record = await pollForRecord({
        actorType,
        actorId,
        method,
        path,
        key,
        maxWaitMs: options.maxWaitMs || IDEMPOTENCY_MAX_WAIT_MS
      });

      if (record) {
        if (canReplayRecord(record, options)) {
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
      }

      return {
        action: "error",
        response: buildInProgressResponse()
      };
    }

    let record = await getIdempotencyRecord({ actorType, actorId, method, path, key });
    if (record) {
      const fingerprintError = await verifyIdempotencyFingerprint({
        record,
        requestHmac,
        secret,
        method,
        path,
        query,
        canonicalBody,
        redis,
        lockKey
      });
      if (fingerprintError) return fingerprintError;

      if ((record.status === "COMPLETED" || record.status === "FAILED") && canReplayRecord(record, options)) {
        await tryReleaseLock(redis, lockKey);
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

      // DB-only mode: if a record exists but is still in progress, wait briefly and replay if it completes.
      if (!redis && record.status === "IN_PROGRESS") {
        const completed = await pollForRecord({
          actorType,
          actorId,
          method,
          path,
          key,
          maxWaitMs: options.maxWaitMs || IDEMPOTENCY_MAX_WAIT_MS
        });
        if (completed) {
          if (canReplayRecord(completed, options)) {
            return {
              action: "replay",
              response: buildReplayResponse(completed),
              context: {
                key,
                requestHmac,
                record: completed,
                replayed: true
              }
            };
          }
        }
        return {
          action: "error",
          response: buildInProgressResponse()
        };
      }

      if ((record.status === "COMPLETED" || record.status === "FAILED") && options?.strictReplayTtl === true) {
        const claimedRecord = await claimExpiredIdempotencyRecord({
          idempotencyId: record.idempotency_id,
          nowIso: new Date().toISOString(),
          expiresAt
        });

        if (!claimedRecord) {
          const latest = await getIdempotencyRecord({ actorType, actorId, method, path, key });
          if (latest) {
            const latestFingerprintError = await verifyIdempotencyFingerprint({
              record: latest,
              requestHmac,
              secret,
              method,
              path,
              query,
              canonicalBody,
              redis,
              lockKey
            });
            if (latestFingerprintError) return latestFingerprintError;

            if ((latest.status === "COMPLETED" || latest.status === "FAILED") && canReplayRecord(latest, options)) {
              await tryReleaseLock(redis, lockKey);
              return {
                action: "replay",
                response: buildReplayResponse(latest),
                context: {
                  key,
                  requestHmac,
                  record: latest,
                  replayed: true
                }
              };
            }

            if (latest.status === "IN_PROGRESS" && !redis) {
              const completed = await pollForRecord({
                actorType,
                actorId,
                method,
                path,
                key,
                maxWaitMs: options.maxWaitMs || IDEMPOTENCY_MAX_WAIT_MS
              });
              if (completed) {
                if (canReplayRecord(completed, options)) {
                  return {
                    action: "replay",
                    response: buildReplayResponse(completed),
                    context: {
                      key,
                      requestHmac,
                      record: completed,
                      replayed: true
                    }
                  };
                }
              }
            }
          }

          await tryReleaseLock(redis, lockKey);
          return {
            action: "error",
            response: buildInProgressResponse()
          };
        }

        record = claimedRecord;
      }
    }
    let recordFromUniqueViolation = false;
    if (!record) {
      try {
        record = await insertIdempotencyRecord({
          actor_type: actorType,
          actor_id: actorId,
          method,
          path,
          idempotency_key: key,
          request_hmac: requestHmac,
          status: "IN_PROGRESS",
          expires_at: expiresAt
        });
      } catch (error: any) {
        // Race: another request inserted first (DB unique index).
        if (error?.code === "23505") {
          record = await getIdempotencyRecord({ actorType, actorId, method, path, key });
          recordFromUniqueViolation = true;
        } else {
          await tryReleaseLock(redis, lockKey);
          throw error;
        }
      }
    }
    if (!record) {
      await tryReleaseLock(redis, lockKey);
      throw new Error("Failed to resolve idempotency record");
    }

    // If we lost the insert race, behave like the normal "existing record" path:
    // don't let multiple leaders execute side effects for the same Idempotency-Key.
    if (recordFromUniqueViolation) {
      const fingerprintError = await verifyIdempotencyFingerprint({
        record,
        requestHmac,
        secret,
        method,
        path,
        query,
        canonicalBody,
        redis,
        lockKey
      });
      if (fingerprintError) return fingerprintError;

      if ((record.status === "COMPLETED" || record.status === "FAILED") && canReplayRecord(record, options)) {
        await tryReleaseLock(redis, lockKey);
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

      if (!redis && record.status === "IN_PROGRESS") {
        const completed = await pollForRecord({
          actorType,
          actorId,
          method,
          path,
          key,
          maxWaitMs: options.maxWaitMs || IDEMPOTENCY_MAX_WAIT_MS
        });
        if (completed) {
          if (canReplayRecord(completed, options)) {
            return {
              action: "replay",
              response: buildReplayResponse(completed),
              context: {
                key,
                requestHmac,
                record: completed,
                replayed: true
              }
            };
          }
        }
        return {
          action: "error",
          response: buildInProgressResponse()
        };
      }
    }

    return {
      action: "continue",
      context: {
        key,
        requestHmac,
        actorType,
        actorId,
        method,
        path,
        lockKey: redis ? lockKey : null,
        record,
        expiresAt
      }
    };
  } catch (error) {
    if (options.failOpen ?? true) {
      console.error("[idempotency] begin failed; proceeding without idempotency", error);
      return { action: "skip" };
    }
    throw error;
  }
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
  const redis = tryGetRedisClient();
  if (context.lockKey) {
    await tryReleaseLock(redis, context.lockKey);
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
