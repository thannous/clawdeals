import { createMcpHandler, McpServer, type AuthInfo } from "@modelcontextprotocol/server";

import { TOOLS, executeTool } from "../packages/clawdeals-mcp/mcp/tools.mjs";
import { capToolOutputBytes } from "../src/webmcp/security/output-cap";
import { sanitizeToolOutput } from "../src/webmcp/security/sanitize";

export const REMOTE_MCP_PATH = "/api/mcp";

const REMOTE_MCP_VERSION = "0.3.0-canary";
const OAUTH_ACCESS_TOKEN_PREFIX = "cd_at_";
const DEFAULT_AUTH_TIMEOUT_MS = 5000;
const DEFAULT_TOOL_TIMEOUT_MS = 15000;
const DEFAULT_MAX_REQUEST_BYTES = 64 * 1024;
const MAX_TOOL_OUTPUT_BYTES = 16 * 1024;
const DEFAULT_ALLOWED_HOSTS = ["clawdeals.com", "localhost", "127.0.0.1", "[::1]"];
const DEFAULT_ALLOWED_ORIGINS = ["https://clawdeals.com", "https://app.clawdeals.com"];

const READ_TOOL_SCOPES: Record<string, string> = {
  "clawdeals.deals.list": "deals:read",
  "clawdeals.deals.get": "deals:read",
  "clawdeals.watchlists.list": "watchlists:read",
  "clawdeals.watchlists.get": "watchlists:read",
  "clawdeals.watchlists.get_matches": "watchlists:read",
  "clawdeals.listings.list": "listings:read",
  "clawdeals.listings.get": "listings:read"
};

const SUPPORTED_READ_SCOPES = Array.from(new Set(Object.values(READ_TOOL_SCOPES)));

export type RemoteMcpEnv = {
  APP_ORIGIN?: string;
  REMOTE_MCP_ENABLED?: string;
  MCP_AUTH_TIMEOUT_MS?: string;
  MCP_TOOL_TIMEOUT_MS?: string;
  MCP_MAX_REQUEST_BYTES?: string;
  MCP_CANARY_AGENT_IDS?: string;
  MCP_CANARY_INSTALLATION_IDS?: string;
  MCP_ALLOWED_HOSTS?: string;
  MCP_ALLOWED_ORIGINS?: string;
};

type CanaryIdentity = {
  agentId: string;
  installationId: string;
  scopes: string[];
};

type AuthResult =
  | { ok: true; authInfo: AuthInfo; identity: CanaryIdentity }
  | { ok: false; response: Response };

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseCsv(value: string | undefined) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function requestIdFrom(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim();
  if (supplied && supplied.length <= 128 && /^[a-zA-Z0-9._:-]+$/.test(supplied)) {
    return supplied;
  }
  return crypto.randomUUID();
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() || "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  const token = match?.[1] || "";
  if (!token || token.length > 4096) return null;
  return token;
}

function jsonError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  headers: HeadersInit = {}
) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: { code, message, details: {} },
      meta: { request_id: requestId }
    }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...headers
      }
    }
  );
}

function bearerChallenge(error?: string, scope?: string) {
  const fields = ['Bearer realm="clawdeals-mcp"'];
  if (error) fields.push(`error="${error}"`);
  if (scope) fields.push(`scope="${scope}"`);
  return fields.join(", ");
}

function allowedValues(configured: string | undefined, defaults: string[]) {
  const values = parseCsv(configured);
  return values.size > 0 ? values : new Set(defaults);
}

function validateHost(request: Request, env: RemoteMcpEnv, requestId: string) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const allowed = allowedValues(env.MCP_ALLOWED_HOSTS, DEFAULT_ALLOWED_HOSTS);
  if (allowed.has(hostname)) return null;
  return jsonError(421, "MISDIRECTED_REQUEST", "Host is not allowed", requestId);
}

function validateOrigin(request: Request, env: RemoteMcpEnv, requestId: string) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = allowedValues(env.MCP_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  if (allowed.has(origin)) return null;
  return jsonError(403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed", requestId);
}

function withCors(response: Response, request: Request, env: RemoteMcpEnv) {
  const origin = request.headers.get("origin");
  if (!origin) return response;
  const allowed = allowedValues(env.MCP_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  if (!allowed.has(origin)) return response;

  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "Authorization, Content-Type, Last-Event-ID, Mcp-Method, Mcp-Name, Mcp-Protocol-Version, Mcp-Session-Id, X-Request-Id"
  );
  headers.set("access-control-expose-headers", "Mcp-Session-Id, Retry-After, WWW-Authenticate, X-Request-Id");
  headers.append("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function preflightResponse(request: Request, env: RemoteMcpEnv) {
  return withCors(new Response(null, { status: 204, headers: { "cache-control": "no-store" } }), request, env);
}

function canaryIsConfigured(env: RemoteMcpEnv) {
  if (!isEnabled(env.REMOTE_MCP_ENABLED)) return false;
  return parseCsv(env.MCP_CANARY_AGENT_IDS).size > 0 || parseCsv(env.MCP_CANARY_INSTALLATION_IDS).size > 0;
}

function declaredRequestSizeError(request: Request, env: RemoteMcpEnv, requestId: string) {
  if (request.method !== "POST") return null;
  const maxBytes = parsePositiveInteger(env.MCP_MAX_REQUEST_BYTES, DEFAULT_MAX_REQUEST_BYTES);
  const contentLength = Number.parseInt(request.headers.get("content-length") || "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return jsonError(413, "PAYLOAD_TOO_LARGE", "MCP request body is too large", requestId);
  }
  return null;
}

async function bufferBoundedRequestBody(
  request: Request,
  env: RemoteMcpEnv,
  requestId: string
): Promise<{ ok: true; request: Request } | { ok: false; response: Response }> {
  if (request.method !== "POST" || !request.body) return { ok: true, request };
  const maxBytes = parsePositiveInteger(env.MCP_MAX_REQUEST_BYTES, DEFAULT_MAX_REQUEST_BYTES);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("payload limit exceeded");
        return {
          ok: false,
          response: jsonError(413, "PAYLOAD_TOO_LARGE", "MCP request body is too large", requestId)
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      response: jsonError(400, "INVALID_REQUEST", "MCP request body could not be read", requestId)
    };
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return {
    ok: true,
    request: new Request(request.url, {
      method: request.method,
      headers,
      body,
      redirect: request.redirect,
      signal: request.signal
    })
  };
}

function isCanaryIdentityAllowed(identity: CanaryIdentity, env: RemoteMcpEnv) {
  const agentIds = parseCsv(env.MCP_CANARY_AGENT_IDS);
  const installationIds = parseCsv(env.MCP_CANARY_INSTALLATION_IDS);
  return agentIds.has(identity.agentId) || installationIds.has(identity.installationId);
}

async function authenticateCanaryRequest(
  request: Request,
  env: RemoteMcpEnv,
  requestId: string
): Promise<AuthResult> {
  if (!canaryIsConfigured(env)) {
    return {
      ok: false,
      response: jsonError(503, "MCP_CANARY_DISABLED", "Remote MCP canary is not enabled", requestId)
    };
  }

  const token = readBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: jsonError(401, "UNAUTHORIZED", "Bearer authentication is required", requestId, {
        "www-authenticate": bearerChallenge("invalid_token")
      })
    };
  }

  // API keys are deliberately rejected for the canary: legacy/global keys are
  // not installation-scoped and therefore do not receive the same scope checks.
  if (!token.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) {
    return {
      ok: false,
      response: jsonError(401, "OAUTH_ACCESS_TOKEN_REQUIRED", "An OAuth access token is required", requestId, {
        "www-authenticate": bearerChallenge("invalid_token")
      })
    };
  }

  const appOrigin = env.APP_ORIGIN || "https://app.clawdeals.com";
  const identityUrl = new URL("/api/v1/agents/me", appOrigin);
  const timeoutMs = parsePositiveInteger(env.MCP_AUTH_TIMEOUT_MS, DEFAULT_AUTH_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(identityUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "x-clawdeals-origin": "mcp:remote-auth",
        "x-request-id": requestId
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    return {
      ok: false,
      response: jsonError(503, "AUTH_UNAVAILABLE", "Authentication service is unavailable", requestId, {
        "retry-after": "5"
      })
    };
  }

  if (!response.ok) {
    if (response.status === 429) {
      return {
        ok: false,
        response: jsonError(429, "RATE_LIMITED", "Authentication rate limit exceeded", requestId, {
          ...(response.headers.get("retry-after") ? { "retry-after": response.headers.get("retry-after")! } : {})
        })
      };
    }
    if (response.status >= 500) {
      return {
        ok: false,
        response: jsonError(503, "AUTH_UNAVAILABLE", "Authentication service is unavailable", requestId, {
          "retry-after": "5"
        })
      };
    }
    return {
      ok: false,
      response: jsonError(401, "UNAUTHORIZED", "OAuth access token is invalid", requestId, {
        "www-authenticate": bearerChallenge("invalid_token")
      })
    };
  }

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      response: jsonError(503, "AUTH_UNAVAILABLE", "Authentication response is invalid", requestId, {
        "retry-after": "5"
      })
    };
  }

  const data = payload?.data;
  const agentId = typeof data?.agent_id === "string" ? data.agent_id : "";
  const installationId = typeof data?.installation_id === "string" ? data.installation_id : "";
  const scopes = Array.isArray(data?.oauth_scopes)
    ? Array.from(new Set(data.oauth_scopes.filter((scope: unknown) => typeof scope === "string"))) as string[]
    : [];
  const identity = { agentId, installationId, scopes };

  if (!agentId || !installationId) {
    return {
      ok: false,
      response: jsonError(403, "INSTALLATION_REQUIRED", "An installation-scoped identity is required", requestId)
    };
  }

  if (!isCanaryIdentityAllowed(identity, env)) {
    return {
      ok: false,
      response: jsonError(403, "MCP_CANARY_FORBIDDEN", "Identity is not enrolled in the remote MCP canary", requestId)
    };
  }

  if (!SUPPORTED_READ_SCOPES.some((scope) => scopes.includes(scope))) {
    const requiredScopes = SUPPORTED_READ_SCOPES.join(" ");
    return {
      ok: false,
      response: jsonError(403, "INSUFFICIENT_SCOPE", "A supported read scope is required", requestId, {
        "www-authenticate": bearerChallenge("insufficient_scope", requiredScopes)
      })
    };
  }

  const apiBase = new URL("/api", appOrigin).toString().replace(/\/$/, "");
  const resource = new URL(REMOTE_MCP_PATH, request.url);
  return {
    ok: true,
    identity,
    authInfo: {
      token,
      clientId: installationId,
      scopes,
      resource,
      extra: {
        agentId,
        installationId,
        requestId,
        apiBase,
        toolTimeoutMs: parsePositiveInteger(env.MCP_TOOL_TIMEOUT_MS, DEFAULT_TOOL_TIMEOUT_MS)
      }
    }
  };
}

function annotationsFor(toolName: string) {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    title: toolName
  };
}

export function createRemoteMcpServer(authInfo?: AuthInfo) {
  const server = new McpServer({
    name: "clawdeals",
    version: REMOTE_MCP_VERSION
  });

  if (!authInfo) return server;

  const extra = authInfo.extra || {};
  const apiBase = typeof extra.apiBase === "string" ? extra.apiBase : "";
  const requestId = typeof extra.requestId === "string" ? extra.requestId : crypto.randomUUID();
  const toolTimeoutMs = typeof extra.toolTimeoutMs === "number" ? String(extra.toolTimeoutMs) : String(DEFAULT_TOOL_TIMEOUT_MS);

  for (const tool of TOOLS) {
    const requiredScope = READ_TOOL_SCOPES[tool.name];
    if (!requiredScope || !authInfo.scopes.includes(requiredScope)) continue;

    server.registerTool(
      tool.name,
      {
        description: `${tool.description} (remote canary, read-only)`,
        inputSchema: tool.inputSchema,
        annotations: annotationsFor(tool.name)
      },
      async (args) => {
        const startedAt = Date.now();
        const rawStable = await executeTool(tool.name, args || {}, {
          requestId,
          env: {
            CLAWDEALS_API_KEY: authInfo.token,
            CLAWDEALS_API_BASE: apiBase,
            CLAWDEALS_ORIGIN: "mcp:remote",
            CLAWDEALS_TIMEOUT_MS: toolTimeoutMs
          },
          fetchImpl: fetch
        });

        const sanitized = sanitizeToolOutput(rawStable);
        const capped = capToolOutputBytes(sanitized, { maxBytes: MAX_TOOL_OUTPUT_BYTES });
        let stable: any = capped.value;
        if (capped.truncated && (!stable || typeof stable !== "object" || typeof stable.ok !== "boolean")) {
          stable = {
            ok: false,
            error: {
              code: "OUTPUT_TOO_LARGE",
              message: "Tool output exceeded the remote MCP size limit",
              details: { max_bytes: MAX_TOOL_OUTPUT_BYTES }
            },
            meta: { request_id: rawStable?.meta?.request_id || requestId, output_truncated: true }
          };
        } else if (capped.truncated) {
          stable = {
            ...stable,
            meta: {
              ...(stable.meta && typeof stable.meta === "object" ? stable.meta : {}),
              output_truncated: true,
              max_output_bytes: MAX_TOOL_OUTPUT_BYTES
            }
          };
        }

        let text = JSON.stringify(stable);
        let outputBytes = new TextEncoder().encode(text).byteLength;
        if (outputBytes > MAX_TOOL_OUTPUT_BYTES) {
          stable = {
            ok: false,
            error: {
              code: "OUTPUT_TOO_LARGE",
              message: "Tool output exceeded the remote MCP size limit",
              details: { max_bytes: MAX_TOOL_OUTPUT_BYTES }
            },
            meta: {
              request_id: rawStable?.meta?.request_id || requestId,
              output_truncated: true
            }
          };
          text = JSON.stringify(stable);
          outputBytes = new TextEncoder().encode(text).byteLength;
        }

        console.log(
          JSON.stringify({
            event: "mcp.remote.tool_completed",
            request_id: stable?.meta?.request_id || requestId,
            agent_id: extra.agentId || null,
            installation_id: extra.installationId || null,
            tool: tool.name,
            ok: Boolean(stable?.ok),
            error_code: stable?.ok ? null : stable?.error?.code || "ERROR",
            output_bytes: outputBytes,
            output_truncated: capped.truncated || stable?.error?.code === "OUTPUT_TOO_LARGE",
            latency_ms: Date.now() - startedAt
          })
        );

        return {
          structuredContent: stable,
          content: [{ type: "text" as const, text }],
          isError: !stable.ok
        };
      }
    );
  }

  return server;
}

const remoteMcpHandler = createMcpHandler(
  ({ authInfo }) => createRemoteMcpServer(authInfo),
  {
    legacy: "stateless",
    responseMode: "auto",
    onerror: () => {
      // Protocol errors can include attacker-controlled request fragments.
      console.log(JSON.stringify({ event: "mcp.remote.protocol_error" }));
    }
  }
);

export async function handleRemoteMcpRequest(request: Request, env: RemoteMcpEnv) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  let response: Response;
  let identity: CanaryIdentity | null = null;

  if (new URL(request.url).pathname !== REMOTE_MCP_PATH) {
    response = jsonError(404, "NOT_FOUND", "MCP endpoint not found", requestId);
  } else {
    const hostError = validateHost(request, env, requestId);
    if (hostError) {
      response = hostError;
    } else {
      const originError = validateOrigin(request, env, requestId);
      if (originError) {
        response = originError;
      } else if (request.method === "OPTIONS") {
        response = preflightResponse(request, env);
      } else if (!canaryIsConfigured(env)) {
        // The kill switch must fail before authentication or request-body reads.
        response = jsonError(503, "MCP_CANARY_DISABLED", "Remote MCP canary is not enabled", requestId);
      } else {
        const declaredTooLarge = declaredRequestSizeError(request, env, requestId);
        if (declaredTooLarge) {
          response = declaredTooLarge;
        } else {
          const auth = await authenticateCanaryRequest(request, env, requestId);
          if ("response" in auth) {
            response = auth.response;
          } else {
            identity = auth.identity;
            const boundedRequest = await bufferBoundedRequestBody(request, env, requestId);
            if ("response" in boundedRequest) {
              response = boundedRequest.response;
            } else {
              response = await remoteMcpHandler.fetch(boundedRequest.request, { authInfo: auth.authInfo });
            }
          }
        }
      }
    }
  }

  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  headers.set("cache-control", "no-store");
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
  response = withCors(response, request, env);

  console.log(
    JSON.stringify({
      event: "mcp.remote.request_completed",
      request_id: requestId,
      method: request.method,
      status: response.status,
      agent_id: identity?.agentId || null,
      installation_id: identity?.installationId || null,
      latency_ms: Date.now() - startedAt
    })
  );

  return response;
}
