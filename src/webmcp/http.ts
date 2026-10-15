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
  apiKey?: string | null;
};

type AuthMode = "required" | "owner_session" | "none";

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

function unknownWriteOutcome(requestId: string): StableToolResult<any> {
  return stableError(
    requestId,
    "OUTCOME_UNKNOWN",
    "The write may have reached the server, so its outcome is unknown",
    { safe_to_retry: false }
  );
}

async function callWebmcpHttp<T = any>(options: CallOptions & { auth: AuthMode }): Promise<StableToolResult<T>> {
  const requestId = options.requestId || randomUuid();
  if (options.signal?.aborted) {
    return stableError(requestId, "ABORTED", "Tool execution was cancelled");
  }
  const apiKey = options.auth === "required" ? (options.apiKey === undefined ? getStoredApiKey() : options.apiKey) : null;
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
      credentials: "same-origin",
      signal: options.signal,
      body: options.method === "GET" ? undefined : JSON.stringify(options.body ?? {})
    });

    const resRequestId = getHeaderValue(res.headers, "x-request-id") || requestId;

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const isJson = contentType.includes("application/json");
    let payload: unknown = null;
    let parsedJson = false;
    try {
      if (isJson) {
        payload = await res.json();
        parsedJson = true;
      } else {
        payload = await res.text();
      }
    } catch { /* An HTTP status alone cannot confirm a successful operation. */ }

    if (res.ok) {
      if (!parsedJson) {
        return options.method === "POST"
          ? unknownWriteOutcome(resRequestId)
          : stableError(resRequestId, "INVALID_RESPONSE", "Server returned an unreadable JSON response");
      }
      return {
        ok: true,
        data: payload as T,
        meta: { request_id: resRequestId }
      };
    }

    // A server/gateway timeout or failure may occur after the mutation commits.
    if (options.method === "POST" && (res.status >= 500 || res.status === 408)) {
      return unknownWriteOutcome(resRequestId);
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
    // Once fetch has started, cancelling a write cannot undo server-side work.
    if (options.method === "POST") {
      return unknownWriteOutcome(requestId);
    }
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

export async function callOwnerSessionWebmcp<T = any>(options: CallOptions): Promise<StableToolResult<T>> {
  return callWebmcpHttp({ ...options, auth: "owner_session" });
}
