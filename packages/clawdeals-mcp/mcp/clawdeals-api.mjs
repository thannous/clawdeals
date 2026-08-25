import crypto from "node:crypto";
const DEFAULT_ORIGIN = "mcp";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_API_BASE = "https://app.clawdeals.com/api";

function buildStableError({ code, message, details = {}, requestId, retryAfterSeconds = null }) {
  return {
    ok: false,
    error: {
      code: code || "ERROR",
      message: message || "Request failed",
      details: details && typeof details === "object" ? details : {}
    },
    meta: {
      request_id: requestId || crypto.randomUUID(),
      ...(typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) ? { retry_after_seconds: retryAfterSeconds } : {})
    }
  };
}

function codeFromStatus(status) {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  return "ERROR";
}

function parseRetryAfterSeconds(value) {
  if (!value) return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeBaseUrl(baseUrl) {
  const raw = typeof baseUrl === "string" ? baseUrl.trim() : "";
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function normalizeTimeoutMs(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_TIMEOUT_MS;
}

function isWriteMethod(method) {
  const normalized = String(method || "GET").toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS";
}

function safeJsonParse(text) {
  if (!text) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, value: null };
  }
}

function toQueryStringParams(query) {
  const params = new URLSearchParams();
  if (!query || typeof query !== "object") return params;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      // REST handlers in this repo typically expect comma-separated strings, not repeated keys.
      params.set(key, value.map((v) => String(v)).join(","));
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}

export async function callClawdeals({
  method,
  path,
  query,
  body,
  idempotencyKey,
  requestId,
  env = process.env,
  fetchImpl = fetch
}) {
  const apiKey = env.CLAWDEALS_API_KEY;
  if (!apiKey) {
    return buildStableError({
      code: "UNAUTHORIZED",
      message: "CLAWDEALS_API_KEY is required",
      requestId
    });
  }

  const baseUrl = normalizeBaseUrl(String(env.CLAWDEALS_API_BASE || "").trim() || DEFAULT_API_BASE);
  const origin = (env.CLAWDEALS_ORIGIN || DEFAULT_ORIGIN).trim() || DEFAULT_ORIGIN;
  const timeoutMs = normalizeTimeoutMs(env.CLAWDEALS_TIMEOUT_MS);
  const resolvedRequestId = requestId || crypto.randomUUID();

  const url = new URL(`${baseUrl}${path}`);
  const params = toQueryStringParams(query);
  params.forEach((value, key) => url.searchParams.set(key, value));

  const headers = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "x-clawdeals-origin": origin,
    "x-request-id": resolvedRequestId
  };

  if (idempotencyKey) {
    headers["Idempotency-Key"] = String(idempotencyKey);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  // Prevent this timer from keeping the process alive.
  timeout.unref?.();

  const isWrite = isWriteMethod(method);
  const shouldSendBody = isWrite && body !== undefined;

  try {
    const response = await fetchImpl(url.toString(), {
      method,
      headers: {
        ...headers,
        ...(shouldSendBody ? { "content-type": "application/json; charset=utf-8" } : {})
      },
      body: shouldSendBody ? JSON.stringify(body ?? {}) : undefined,
      signal: controller.signal
    });

    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
    const text = await response.text();
    const parsed = safeJsonParse(text);

    if (!parsed.ok) {
      return buildStableError({
        code: response.status >= 400 ? codeFromStatus(response.status) : "ERROR",
        message: "Non-JSON response from server",
        requestId: resolvedRequestId,
        retryAfterSeconds
      });
    }

    const value = parsed.value;

    if (response.status < 400) {
      return {
        ok: true,
        data: value,
        meta: {
          request_id: resolvedRequestId
        }
      };
    }

    const serverError = value && typeof value === "object" ? value.error : null;
    if (serverError && typeof serverError === "object") {
      return {
        ok: false,
        error: {
          code: serverError.code || codeFromStatus(response.status),
          message: serverError.message || "Request failed",
          details: serverError.details && typeof serverError.details === "object" ? serverError.details : {}
        },
        meta: {
          request_id: resolvedRequestId,
          ...(typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) ? { retry_after_seconds: retryAfterSeconds } : {})
        }
      };
    }

    return buildStableError({
      code: codeFromStatus(response.status),
      message: response.statusText || "Request failed",
      requestId: resolvedRequestId,
      retryAfterSeconds
    });
  } catch (error) {
    const isAbort = error && typeof error === "object" && error.name === "AbortError";
    return buildStableError({
      code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
      message: isAbort ? "Request timed out" : "Network error",
      requestId: resolvedRequestId
    });
  } finally {
    clearTimeout(timeout);
  }
}
