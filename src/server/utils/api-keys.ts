import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getEnv, getNumberEnv } from "../config/env";
import { isSandboxEnv } from "../config/runtime";

const DEFAULT_API_KEY_NAMESPACE = isSandboxEnv() ? "cd_sandbox" : "cd_live";
const API_KEY_NAMESPACE = getEnv("API_KEY_NAMESPACE", { defaultValue: DEFAULT_API_KEY_NAMESPACE });
const API_KEY_PREFIX_BYTES = 6; // 6 bytes -> 8 chars base64url
const API_KEY_PREFIX_MIN = 8;
const API_KEY_PREFIX_MAX = 12;
const API_KEY_SECRET_BYTES = 32;
const API_KEY_BCRYPT_ROUNDS = getNumberEnv("API_KEY_BCRYPT_ROUNDS", { defaultValue: 10 });
const API_KEY_GRACE_SECONDS = getNumberEnv("API_KEY_GRACE_SECONDS", {
  defaultValue: 24 * 60 * 60
});

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export { API_KEY_NAMESPACE, API_KEY_GRACE_SECONDS };

if (isSandboxEnv() && API_KEY_NAMESPACE === "cd_live") {
  throw new Error("Sandbox must not use production API key namespace 'cd_live'. Set API_KEY_NAMESPACE=cd_sandbox.");
}

export function generateApiKey() {
  const prefix = crypto.randomBytes(API_KEY_PREFIX_BYTES).toString("base64url");
  const secret = crypto.randomBytes(API_KEY_SECRET_BYTES).toString("base64url");
  const apiKey = `${API_KEY_NAMESPACE}_${prefix}.${secret}`;
  return { apiKey, prefix, secret };
}

export function parseApiKeyAnyNamespace(apiKey) {
  if (typeof apiKey !== "string") return null;
  const trimmed = apiKey.trim();
  if (!trimmed) return null;

  const dotIndex = trimmed.indexOf(".");
  if (dotIndex === -1) return null;
  if (trimmed.indexOf(".", dotIndex + 1) !== -1) return null;

  const prefixPart = trimmed.slice(0, dotIndex);
  const secret = trimmed.slice(dotIndex + 1);
  if (!prefixPart || !secret) return null;

  const lastUnderscore = prefixPart.lastIndexOf("_");
  if (lastUnderscore === -1) return null;

  const namespace = prefixPart.slice(0, lastUnderscore);
  const prefix = prefixPart.slice(lastUnderscore + 1);
  if (!namespace || !prefix) return null;

  // Namespace is intentionally loose: allows `cd_live`, `cd_sandbox`, etc.
  if (!/^[a-z0-9_]+$/i.test(namespace)) return null;
  if (prefix.length < API_KEY_PREFIX_MIN || prefix.length > API_KEY_PREFIX_MAX) return null;
  if (!BASE64URL_RE.test(prefix) || !BASE64URL_RE.test(secret)) return null;

  return { namespace, prefix, secret };
}

export function parseApiKey(apiKey) {
  if (typeof apiKey !== "string") return null;
  const trimmed = apiKey.trim();
  if (!trimmed) return null;
  const dotIndex = trimmed.indexOf(".");
  if (dotIndex === -1) return null;
  if (trimmed.indexOf(".", dotIndex + 1) !== -1) return null;

  const prefixPart = trimmed.slice(0, dotIndex);
  const secret = trimmed.slice(dotIndex + 1);
  if (!prefixPart || !secret) return null;

  const namespacePrefix = `${API_KEY_NAMESPACE}_`;
  if (!prefixPart.startsWith(namespacePrefix)) return null;

  const prefix = prefixPart.slice(namespacePrefix.length);
  if (prefix.length < API_KEY_PREFIX_MIN || prefix.length > API_KEY_PREFIX_MAX) return null;
  if (!BASE64URL_RE.test(prefix) || !BASE64URL_RE.test(secret)) return null;

  return { prefix, secret };
}

export async function hashApiKeySecret(secret) {
  return bcrypt.hash(secret, API_KEY_BCRYPT_ROUNDS);
}

export async function verifyApiKeySecret(secret, hash) {
  return bcrypt.compare(secret, hash);
}

export function computeGraceExpiry(seconds = API_KEY_GRACE_SECONDS, now = new Date()) {
  return new Date(now.getTime() + seconds * 1000);
}
