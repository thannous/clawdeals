import { createHmacFingerprint, DEFAULT_FINGERPRINT_ALGO } from "./fingerprint";
import { redactValue } from "./redaction";

const DEFAULT_HMAC_ENV = "AUDIT_HMAC_SECRET";

function defaultWriter() {
  throw new Error("No audit log writer configured.");
}

function ensureObject(value) {
  if (!value || typeof value !== "object") return {};
  return value;
}

function buildRecord(event, now, redactor, secret) {
  if (!event || typeof event !== "object") {
    throw new Error("Audit event payload is required.");
  }

  const occurredAt = event.occurredAt ? new Date(event.occurredAt) : now();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("Invalid audit event occurredAt value.");
  }

  const payloadForRedaction = {
    actor: event.actor,
    auth: event.auth,
    request: event.request,
    action: event.action,
    security: event.security,
    policy: event.policy,
    payload: event.payload,
    rate_limit: event.rateLimit,
    idempotency: event.idempotency
  };

  const { value: redactedPayload, redacted } = redactor(payloadForRedaction);
  const payloadFingerprint = createHmacFingerprint({
    data: redactedPayload.payload ?? {},
    secret
  });

  return {
    occurred_at: occurredAt.toISOString(),
    actor: ensureObject(redactedPayload.actor),
    auth: ensureObject(redactedPayload.auth),
    request: ensureObject(redactedPayload.request),
    action: ensureObject(redactedPayload.action),
    security: ensureObject(redactedPayload.security),
    policy: ensureObject(redactedPayload.policy),
    payload: ensureObject(redactedPayload.payload),
    rate_limit: redactedPayload.rate_limit ?? null,
    idempotency: redactedPayload.idempotency ?? null,
    outcome: event.outcome || "UNKNOWN",
    request_id: event.request?.id ?? null,
    ip_full: event.request?.ip ?? null,
    user_agent: event.request?.userAgent ?? null,
    payload_fingerprint: payloadFingerprint,
    redacted,
    hash_algo: DEFAULT_FINGERPRINT_ALGO
  };
}

export function createAuditLogger({ write, hmacSecret, now, redact } = {}) {
  const writer = write ?? defaultWriter;
  const timeSource = now ?? (() => new Date());
  const redactor = redact ?? redactValue;
  const secret = hmacSecret ?? process.env[DEFAULT_HMAC_ENV];

  if (!secret) {
    throw new Error(`${DEFAULT_HMAC_ENV} is required to compute audit fingerprints.`);
  }

  return async function logAuditEvent(event) {
    const row = buildRecord(event, timeSource, redactor, secret);
    await writer(row);
    return row;
  };
}

export function createConsoleAuditWriter({ logger = console } = {}) {
  return async function writeAuditRow(row) {
    logger.info("[audit]", JSON.stringify(row));
  };
}
