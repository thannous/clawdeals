import { redactEmailsAndPhones } from "./free-text-redaction";

const DEFAULT_REDACT_KEYS = [
  "password",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "cookie",
  "set-cookie",
  "email",
  "phone",
  "address",
  "api_key",
  "apikey",
  "client_secret",
  "private_key"
];

const DEFAULT_REDACT_KEY_SET = new Set(DEFAULT_REDACT_KEYS.map((k) => k.toLowerCase()));
const DEFAULT_KEY_MATCHERS = [
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /private[-_]?key/i,
  /api[-_]?key(?![-_]?id\b)/i
];

function isPlainObject(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (DEFAULT_REDACT_KEY_SET.has(normalized)) return true;
  return DEFAULT_KEY_MATCHERS.some((re) => re.test(key));
}

function sanitizeInternal(value: any, depth: number, seen: WeakSet<object>): any {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    // Redact PII even inside free-text fields.
    return redactEmailsAndPhones(value).text;
  }

  if (typeof value !== "object") return value;

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (depth >= 6) return "[Truncated]";

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeInternal(entry, depth + 1, seen));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const out: any = {};
  for (const [k, v] of Object.entries(value)) {
    if (shouldRedactKey(k)) {
      out[k] = "[REDACTED]";
      continue;
    }
    out[k] = sanitizeInternal(v, depth + 1, seen);
  }
  return out;
}

export function sanitizeToolOutput<T>(value: T): T {
  const seen = new WeakSet<object>();
  return sanitizeInternal(value, 0, seen) as T;
}

