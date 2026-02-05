import { createHmac } from "node:crypto";

const DEFAULT_HASH_ALGORITHM = "sha256";
const DEFAULT_FINGERPRINT_ALGO = "hmac-sha256";

function normalizeValue(value, seen) {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, seen));
  }
  const keys = Object.keys(value).sort();
  const out = {};
  for (const key of keys) {
    out[key] = normalizeValue(value[key], seen);
  }
  return out;
}

export function stableStringify(value) {
  const normalized = normalizeValue(value, new WeakSet());
  return JSON.stringify(normalized);
}

export function createHmacFingerprint({ data, secret, algorithm = DEFAULT_HASH_ALGORITHM } = {}) {
  if (!secret) {
    throw new Error("HMAC secret is required to compute audit fingerprints.");
  }
  const payload = stableStringify(data);
  return createHmac(algorithm, secret).update(payload).digest("hex");
}

export { DEFAULT_FINGERPRINT_ALGO };
