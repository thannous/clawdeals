import { getStoredApiKey } from "../ui/developer/storage";
import { randomUuid } from "./utils";
import type { StableToolResult } from "./types";

type CallOptions = {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: any;
  requestId?: string;
  idempotencyKey?: string | null;
  signal?: AbortSignal;
};

type AuthMode = "required" | "none";

function getHeaderValue(headers: Headers, name: string): string | null {
  try {
    return headers.get(name);
  } catch {
    return null;
  }
}

function toQueryString(query: any): string {
  if (!query || typeof query !== "object") return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function stableError<T = any>(
  requestId: string,
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): StableToolResult<T> {
  return {
    ok: false,
    error: { code, message, details },
    meta: { request_id: requestId }
  };
}

async function callWebmcpHttp<T = any>(options: CallOptions & { auth: AuthMode }): Promise<StableToolResult<T>> {
  const requestId = options.requestId || randomUuid();
  const apiKey = options.auth === "none" ? null : getStoredApiKey();
  if (options.auth === "required" && !apiKey) {
    return stableError(requestId, "UNAUTHORIZED", "API key required; go to /start");
  }

  const query = options.query || {};
  const url = `/api${options.path}${toQueryString(query)}`;

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "x-request-id": requestId,
    "x-client-channel": "webmcp",
    "x-clawdeals-origin": "webmcp"
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  if (options.idempotencyKey) {
    headers["idempotency-key"] = String(options.idempotencyKey);
  }

  try {
    const res = await fetch(url, {
      method: options.method,
      headers,
      signal: options.signal,
      body: options.method === "GET" ? undefined : JSON.stringify(options.body ?? {})
    });

    const resRequestId = getHeaderValue(res.headers, "x-request-id") || requestId;

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

    if (res.ok) {
      return {
        ok: true,
        data: (payload as any) ?? ({} as any),
        meta: { request_id: resRequestId }
      };
    }

    const err = (payload as any)?.error;
    if (err && typeof err === "object") {
      return {
        ok: false,
        error: {
          code: String(err.code || "ERROR"),
          message: String(err.message || `Request failed (${res.status})`),
          details: (err.details && typeof err.details === "object" ? err.details : {}) as any
        },
        meta: { request_id: resRequestId }
      };
    }

    return stableError(resRequestId, "ERROR", typeof payload === "string" && payload ? payload : `Request failed (${res.status})`);
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return stableError(requestId, "ABORTED", "Tool execution was cancelled");
    }
    return stableError(requestId, "NETWORK_ERROR", error?.message || "Network error");
  }
}

export async function callClawdealsWebmcp<T = any>(options: CallOptions): Promise<StableToolResult<T>> {
  return callWebmcpHttp({ ...options, auth: "required" });
}

export async function callPublicWebmcp<T = any>(options: CallOptions): Promise<StableToolResult<T>> {
  return callWebmcpHttp({ ...options, auth: "none" });
}
