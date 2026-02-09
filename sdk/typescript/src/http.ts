import { redactHeaders } from "./redact";

export type FetchLike = typeof fetch;

export type Logger = {
  debug?: (msg: string, meta?: unknown) => void;
  info?: (msg: string, meta?: unknown) => void;
  warn?: (msg: string, meta?: unknown) => void;
  error?: (msg: string, meta?: unknown) => void;
};

export type ClawdealsFetchOptions = {
  fetch?: FetchLike;
  apiKeyBearer?: string;
  apiKeyHeader?: string;
  retries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  logger?: Logger;
  requestIdHeader?: string;
  idempotencyHeader?: string;
};

function isWriteMethod(method: string) {
  const m = method.toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function backoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number) {
  const exp = baseDelayMs * Math.pow(2, attempt);
  const jitter = 0.2 * exp * (Math.random() - 0.5);
  return clamp(Math.round(exp + jitter), 0, maxDelayMs);
}

function getOrCreateHeader(headers: Headers, name: string, valueFactory: () => string) {
  const existing = headers.get(name);
  if (existing && existing.trim() !== "") return existing;
  const value = valueFactory();
  headers.set(name, value);
  return value;
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Best-effort fallback.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isNetworkError(err: unknown) {
  // `fetch` in browsers throws TypeError on network errors.
  // Undici (Node) throws TypeError("fetch failed") with a nested cause.
  return err instanceof TypeError;
}

async function shouldRetryIdempotencyInProgress(res: Response) {
  if (res.status !== 409) return false;
  const retryAfter = res.headers.get("Retry-After");
  if (!retryAfter) return false;

  try {
    const cloned = res.clone();
    const body = await cloned.json().catch(() => null);
    const code = body?.error?.code;
    return code === "IDEMPOTENCY_IN_PROGRESS";
  } catch {
    return false;
  }
}

export function createClawdealsFetch(options: ClawdealsFetchOptions = {}): FetchLike {
  const baseFetch = options.fetch ?? fetch;
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 200;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 2_000;
  const logger = options.logger;
  const requestIdHeader = options.requestIdHeader ?? "X-Request-Id";
  const idempotencyHeader = options.idempotencyHeader ?? "Idempotency-Key";

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isWrite = isWriteMethod(method);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

    if (options.apiKeyBearer && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${options.apiKeyBearer}`);
    }
    if (options.apiKeyHeader && !headers.has("x-clawdeals-api-key")) {
      headers.set("x-clawdeals-api-key", options.apiKeyHeader);
    }

    const requestId = getOrCreateHeader(headers, requestIdHeader, randomId);
    const idempotencyKey = isWrite ? getOrCreateHeader(headers, idempotencyHeader, randomId) : undefined;

    const baseRequest = new Request(input, { ...init, method, headers });

    logger?.debug?.("clawdeals-sdk:request", {
      method,
      url: baseRequest.url,
      requestId,
      idempotencyKey: idempotencyKey ? "[present]" : undefined,
      headers: redactHeaders(headers)
    });

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const req = baseRequest.clone();
        const res = await baseFetch(req);

        // Handle idempotency "in progress" (safe to retry with same key).
        if (isWrite && (await shouldRetryIdempotencyInProgress(res)) && attempt < retries) {
          const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
          const delayMs = clamp(Math.round(retryAfter * 1000), 0, maxRetryDelayMs);
          logger?.warn?.("clawdeals-sdk:retry:idempotency_in_progress", {
            attempt,
            delayMs,
            requestId
          });
          await sleep(delayMs);
          continue;
        }

        return res;
      } catch (err) {
        if (!isNetworkError(err) || attempt >= retries) throw err;

        const delayMs = backoffMs(attempt, retryDelayMs, maxRetryDelayMs);
        logger?.warn?.("clawdeals-sdk:retry:network_error", {
          attempt,
          delayMs,
          requestId
        });
        await sleep(delayMs);
      }
    }

    // Unreachable, but keeps TS happy.
    throw new Error("clawdeals-sdk: exhausted retries");
  };
}

