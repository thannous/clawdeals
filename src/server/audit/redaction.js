const DEFAULT_REDACT_KEYS = [
  "password",
  "pass",
  "pwd",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "cookie",
  "set-cookie",
  "api_key",
  "apikey",
  "client_secret",
  "private_key",
  "credit_card",
  "cc",
  "ssn",
  "session",
  "bearer",
  "otp",
  "mfa",
  "pin"
];

const DEFAULT_REDACT_KEY_SET = new Set(DEFAULT_REDACT_KEYS.map((key) => key.toLowerCase()));

const DEFAULT_REDACT_KEY_MATCHERS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /private[-_]?key/i,
  /credit/i,
  /ssn/i
];

const DEFAULT_OPTIONS = {
  replaceWith: "[REDACTED]",
  maxDepth: 6,
  redactStrings: false,
  redactKeys: DEFAULT_REDACT_KEY_SET,
  redactKeyMatchers: DEFAULT_REDACT_KEY_MATCHERS
};

function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function looksSensitiveString(value) {
  if (value.startsWith("Bearer ") || value.startsWith("Basic ")) {
    return true;
  }
  const parts = value.split(".");
  if (parts.length === 3 && parts.every((part) => part.length > 10)) {
    return true;
  }
  return false;
}

function shouldRedactKey(key, options) {
  const normalized = key.toLowerCase();
  if (options.redactKeys?.has(normalized)) {
    return true;
  }
  return options.redactKeyMatchers?.some((matcher) => matcher.test(key)) ?? false;
}

function redactInternal(value, options, depth, state) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== "object") {
    if (options.redactStrings && typeof value === "string" && looksSensitiveString(value)) {
      state.redacted = true;
      return options.replaceWith;
    }
    return value;
  }
  if (state.seen.has(value)) {
    state.redacted = true;
    return "[Circular]";
  }
  state.seen.add(value);
  if (depth >= options.maxDepth) {
    state.redacted = true;
    return "[Truncated]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, options, depth + 1, state));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (shouldRedactKey(key, options)) {
      state.redacted = true;
      out[key] = options.replaceWith;
      continue;
    }
    out[key] = redactInternal(entry, options, depth + 1, state);
  }
  return out;
}

export function redactValue(value, options = {}) {
  const resolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    redactKeys: options.redactKeys
      ? new Set(Array.from(options.redactKeys, (key) => key.toLowerCase()))
      : DEFAULT_OPTIONS.redactKeys,
    redactKeyMatchers: options.redactKeyMatchers ?? DEFAULT_OPTIONS.redactKeyMatchers
  };
  const state = { redacted: false, seen: new WeakSet() };
  const redactedValue = redactInternal(value, resolvedOptions, 0, state);
  return { value: redactedValue, redacted: state.redacted };
}

export { DEFAULT_REDACT_KEYS };
