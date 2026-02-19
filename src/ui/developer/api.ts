import { getPublicApiBaseUrl, joinUrl } from "../../shared/urls";

export type ApiError = {
  status: number;
  code: string;
  message: string;
  meta?: any;
  requestId?: string | null;
};

function randomIdempotencyKey(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

const OWNER_SESSION_RECOVERY_ERRORS = new Set(["UNAUTHORIZED", "SESSION_EXPIRED", "SESSION_REVOKED", "SESSION_INACTIVE"]);

export function buildApiUrl(path: string): string {
  const base = getPublicApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? joinUrl(base, `/api${p}`) : `/api${p}`;
}

function shouldRecoverOwnerSession({
  status,
  code,
  message,
  apiKey
}: {
  status: number;
  code: string;
  message: string;
  apiKey?: string | null;
}) {
  // Recovery is only useful for anonymous/session-cookie flows.
  if (apiKey) return false;
  if (status !== 401) return false;
  if (!OWNER_SESSION_RECOVERY_ERRORS.has(code)) return false;
  if (code === "UNAUTHORIZED") {
    return String(message || "").toLowerCase() === "invalid session cookie";
  }
  return true;
}

async function clearOwnerSessionCookie() {
  const url = buildApiUrl("/v1/auth/logout");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": randomIdempotencyKey()
  };

  try {
    await fetch(url, {
      method: "POST",
      headers,
      body: "{}",
      credentials: "include"
    });
  } catch {
    // Best-effort only.
  }
}

export async function apiRequest<T = any>({
  path,
  method,
  apiKey,
  body,
  idempotencyKey
}: {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  apiKey?: string | null;
  body?: any;
  idempotencyKey?: string | null;
}): Promise<{ data: T; headers: Headers }> {
  const url = buildApiUrl(path);
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const isWrite = method !== "GET";
  if (isWrite) {
    headers["Idempotency-Key"] = idempotencyKey || randomIdempotencyKey();
  }

  const execute = async () => {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const requestId = res.headers.get("x-request-id");
    let json: any = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      json = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => "");
      if (text) {
        json = { error: { code: "ERROR", message: text } };
      }
    }

    return { res, json, requestId };
  };

  const firstAttempt = await execute();

  if (!firstAttempt.res.ok) {
    const code = firstAttempt.json?.error?.code || "ERROR";
    const message = firstAttempt.json?.error?.message || `Request failed (${firstAttempt.res.status})`;
    const meta = firstAttempt.json?.error?.meta;

    if (shouldRecoverOwnerSession({ status: firstAttempt.res.status, code, message, apiKey })) {
      await clearOwnerSessionCookie();
      const retryAttempt = await execute();

      if (!retryAttempt.res.ok) {
        const retryCode = retryAttempt.json?.error?.code || "ERROR";
        const retryMessage = retryAttempt.json?.error?.message || `Request failed (${retryAttempt.res.status})`;
        const retryMeta = retryAttempt.json?.error?.meta;
        const retryError: ApiError = {
          status: retryAttempt.res.status,
          code: retryCode,
          message: retryMessage,
          meta: retryMeta,
          requestId: retryAttempt.requestId
        };
        throw retryError;
      }

      return { data: retryAttempt.json as T, headers: retryAttempt.res.headers };
    }

    const error: ApiError = {
      status: firstAttempt.res.status,
      code,
      message,
      meta,
      requestId: firstAttempt.requestId
    };
    throw error;
  }

  return { data: firstAttempt.json as T, headers: firstAttempt.res.headers };
}

export function maskApiKey(apiKey: string): string {
  const key = String(apiKey || "");
  if (key.length <= 10) return `${key.slice(0, 2)}…`;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
