import crypto from "crypto";
import { hmacSha256 } from "../utils/hmac";

const SENSITIVE_KEYS = [
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "token",
  "poll_token",
  "claim_token",
  "claim_url",
  "verification_code",
  "pair_token",
  "secret",
  "client_secret",
  "private_key"
];

function hasSensitiveKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasSensitiveKey(item));
  return Object.entries(value).some(([key, entry]) => {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.includes(lower)) return true;
    return hasSensitiveKey(entry);
  });
}

export function shouldEncryptResponseBody(body) {
  return hasSensitiveKey(body);
}

export function buildRequestHmac({ secret, method, path, query, canonicalBody }) {
  const data = `${method}\n${path}\n${query}\n${canonicalBody}`;
  return hmacSha256(secret, data);
}

export function encryptJson({ secret, payload, additionalAuthenticatedData = undefined }) {
  if (!secret) {
    throw new Error("IDEMPOTENCY_SECRET is required to encrypt payloads.");
  }
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  if (additionalAuthenticatedData !== undefined) {
    cipher.setAAD(Buffer.from(additionalAuthenticatedData));
  }
  const plaintext = Buffer.from(JSON.stringify(payload));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = [iv.toString("base64"), encrypted.toString("base64"), tag.toString("base64")].join(":");
  return `v1:${packed}`;
}

export function decryptJson({ secret, payload, additionalAuthenticatedData = undefined }) {
  if (!secret) {
    throw new Error("IDEMPOTENCY_SECRET is required to decrypt payloads.");
  }
  if (typeof payload !== "string") {
    throw new Error("Encrypted payload must be a string.");
  }
  if (!payload.startsWith("v1:")) {
    throw new Error("Unsupported encrypted payload version.");
  }
  const parts = payload.slice(3).split(":");
  if (parts.length !== 3) {
    throw new Error("Encrypted payload is malformed.");
  }
  const [ivB64, encryptedB64, tagB64] = parts;
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = Buffer.from(ivB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  // Writers always use a 96-bit IV and full 128-bit tag. Do not accept truncated
  // tags or alternate/malformed base64 encodings on replay.
  if (iv.length !== 12 || tag.length !== 16 ||
      parts.some((part) => Buffer.from(part, "base64").toString("base64") !== part)) {
    throw new Error("Encrypted payload is malformed.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  if (additionalAuthenticatedData !== undefined) {
    decipher.setAAD(Buffer.from(additionalAuthenticatedData));
  }
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(plaintext.toString("utf-8"));
}
