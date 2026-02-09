const SENSITIVE_HEADERS = new Set([
  "authorization",
  "x-clawdeals-api-key"
]);

export function redactHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const out = new Map<string, string>();

  if (!headers) return {};

  const add = (k: unknown, v: unknown) => {
    const key = String(k);
    const lower = key.toLowerCase();
    const value = SENSITIVE_HEADERS.has(lower) ? "[REDACTED]" : String(v);
    out.set(key, value);
  };

  if (headers instanceof Headers) {
    headers.forEach((v, k) => add(k, v));
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) add(k, v);
  } else {
    for (const [k, v] of Object.entries(headers)) add(k, v);
  }

  return Object.fromEntries(out.entries());
}
