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

export function buildApiUrl(path: string): string {
  const base = getPublicApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? joinUrl(base, `/api${p}`) : `/api${p}`;
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

  if (!res.ok) {
    const code = json?.error?.code || "ERROR";
    const message = json?.error?.message || `Request failed (${res.status})`;
    const meta = json?.error?.meta;
    const error: ApiError = { status: res.status, code, message, meta, requestId };
    throw error;
  }

  return { data: json as T, headers: res.headers };
}

export function maskApiKey(apiKey: string): string {
  const key = String(apiKey || "");
  if (key.length <= 10) return `${key.slice(0, 2)}...`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
