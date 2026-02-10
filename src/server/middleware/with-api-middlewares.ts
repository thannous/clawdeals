import { createRequestContext } from "./request-context";
import { applyCanonicalBody } from "./body";
import { applyAuthStub } from "./auth-stub";
import { rateLimitMiddleware } from "../rate-limit/middleware";
import { beginIdempotency, finalizeIdempotency } from "../idempotency/middleware";
import { jsonResponse, sendJson } from "../http/response";
import { sendError } from "../http/errors";
import { mergeTrustContextIntoPolicy } from "../trustscore/context";
import { safeAuditLog } from "../audit/singleton";
import { matchRouteGroupFromRequest } from "../routes/route-groups";

const DEFAULT_OPTIONS = {
  enableRateLimit: true,
  enableIdempotency: true,
  enableAudit: true,
  // Enable CORS only when explicitly configured (env or per-route option).
  cors: null as null | {
    allowOrigins?: string[];
    allowMethods?: string[];
    allowHeaders?: string[];
    maxAgeSeconds?: number;
  },
  idempotencyUseIpFallback: false
};

function isWriteMethod(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

function getHeaderValue(headers: any, name: string): string | null {
  if (!headers) return null;
  const key = String(name || "").toLowerCase();
  const value = headers[key] ?? headers[name];
  if (Array.isArray(value)) return String(value[0] || "");
  if (value === undefined || value === null) return null;
  return String(value);
}

function isWebMcpChannelRequest(req: any): boolean {
  const raw = getHeaderValue(req?.headers, "x-client-channel");
  return raw ? raw.trim().toLowerCase() === "webmcp" : false;
}

function parseCommaList(value: any): string[] {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveCorsOptions(resolved: any) {
  const fromEnv = parseCommaList(process.env.CORS_ALLOW_ORIGINS);
  const fromRoute = Array.isArray(resolved?.cors?.allowOrigins) ? resolved.cors.allowOrigins : [];
  const allowOrigins = fromRoute.length > 0 ? fromRoute : fromEnv;
  if (allowOrigins.length === 0) return null;

  const allowMethods =
    Array.isArray(resolved?.cors?.allowMethods) && resolved.cors.allowMethods.length > 0
      ? resolved.cors.allowMethods
      : ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

  const allowHeaders =
    Array.isArray(resolved?.cors?.allowHeaders) && resolved.cors.allowHeaders.length > 0
      ? resolved.cors.allowHeaders
      : [
          "content-type",
          "authorization",
          "last-event-id",
          "x-request-id",
          "x-api-key",
          "x-clawdeals-api-key",
          "x-agent-id",
          "x-owner-id",
          "x-clawdeals-origin",
          "idempotency-key"
        ];

  const maxAgeSeconds =
    typeof resolved?.cors?.maxAgeSeconds === "number" && Number.isFinite(resolved.cors.maxAgeSeconds)
      ? resolved.cors.maxAgeSeconds
      : 600;

  return { allowOrigins, allowMethods, allowHeaders, maxAgeSeconds };
}

function shouldApplyCors(path: string) {
  // Keep this tight: only endpoints that we intentionally call cross-origin.
  return (
    path === "/api/v1/watchlist-signups" ||
    path === "/api/console/events/stream" ||
    path === "/api/v1/events/stream"
  );
}

function applyCorsHeaders(req: any, res: any, cors: any, path: string) {
  if (!cors || !shouldApplyCors(path)) return { applied: false };
  const origin = req?.headers?.origin;
  if (!origin || typeof origin !== "string") return { applied: false };

  const allowed = cors.allowOrigins.includes(origin);
  if (!allowed) return { applied: false };

  try {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", cors.allowMethods.join(", "));
    res.setHeader("Access-Control-Allow-Headers", cors.allowHeaders.join(", "));
    res.setHeader("Access-Control-Max-Age", String(cors.maxAgeSeconds));
  } catch {
    // If we can't set headers (non-standard res), just skip.
  }
  return { applied: true, origin };
}

function safeDecodeURIComponent(value) {
  if (typeof value !== "string") return value;
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function inferAuditEntityFromPath(path: string) {
  if (!path || typeof path !== "string") {
    return { entityType: null, entityId: null };
  }

  const patterns = [
    { type: "listing", re: /^\/api\/(?:v1|console)\/listings\/([^/]+)/ },
    { type: "thread", re: /^\/api\/(?:v1|console)\/threads\/([^/]+)/ },
    { type: "message", re: /^\/api\/(?:v1|console)\/messages\/([^/]+)/ },
    { type: "offer", re: /^\/api\/(?:v1|console)\/offers\/([^/]+)/ },
    { type: "transaction", re: /^\/api\/(?:v1|console)\/transactions\/([^/]+)/ },
    { type: "escrow", re: /^\/api\/(?:v1|console)\/escrows\/([^/]+)/ },
    { type: "dispute", re: /^\/api\/(?:v1|console)\/disputes\/([^/]+)/ },
    { type: "approval", re: /^\/api\/(?:v1|console)\/approvals\/([^/]+)/ },
    { type: "deal", re: /^\/api\/(?:v1|console)\/deals\/([^/]+)/ },
    { type: "watchlist", re: /^\/api\/(?:v1|console)\/watchlists\/([^/]+)/ },
    { type: "agent", re: /^\/api\/(?:v1|console)\/agents\/([^/]+)/ },
  ];

  for (const pattern of patterns) {
    const match = path.match(pattern.re);
    if (!match?.[1]) continue;
    return { entityType: pattern.type, entityId: safeDecodeURIComponent(match[1]) };
  }

  return { entityType: null, entityId: null };
}

function inferAuditEntityFromBody(body: any) {
  if (!body || typeof body !== "object") {
    return { entityType: null, entityId: null };
  }

  // Common pattern: { entity_type, entity_id } (e.g., reports.create).
  const entityType = typeof body.entity_type === "string" ? body.entity_type : null;
  const entityId = typeof body.entity_id === "string" ? body.entity_id : null;
  if (entityType && entityId) {
    return { entityType, entityId };
  }

  return { entityType: null, entityId: null };
}

function inferAuditEntity(ctx: any) {
  const explicitType = typeof ctx.auditEntityType === "string" ? ctx.auditEntityType : null;
  const explicitId = typeof ctx.auditEntityId === "string" ? ctx.auditEntityId : null;
  if (explicitType || explicitId) {
    return { entityType: explicitType, entityId: explicitId };
  }

  const fromPath = inferAuditEntityFromPath(ctx.path);
  if (fromPath.entityType || fromPath.entityId) {
    return fromPath;
  }

  const fromBody = inferAuditEntityFromBody(ctx.body);
  if (fromBody.entityType || fromBody.entityId) {
    return fromBody;
  }

  return { entityType: null, entityId: null };
}

// safeAuditLog is imported from ../audit/singleton.js

function toIsoString(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function inferOutcome(ctx) {
  if (ctx.outcome?.type) return ctx.outcome.type;
  const status = ctx.response?.status;
  if (!status) return "UNKNOWN";
  if (status < 400) return "SUCCESS";
  return "FAILURE";
}

function buildAuditEvent(ctx) {
  const entity = inferAuditEntity(ctx);
  const security: any = {
    ...(ctx.security || {})
  };
  if (security.origin === undefined || security.origin === null) {
    if (ctx.origin) {
      security.origin = ctx.origin;
    }
  }
  return {
    occurredAt: new Date().toISOString(),
    actor: ctx.actor,
    auth: {
      agent_id: ctx.agentId,
      owner_id: ctx.ownerId,
      api_key_id: ctx.apiKeyId || null,
      api_key_state: ctx.apiKeyState || null
    },
    request: {
      id: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      method: ctx.method,
      path: ctx.path,
      query: ctx.query,
      started_at: toIsoString(ctx.startedAt),
      duration_ms: typeof ctx.durationMs === "number" && Number.isFinite(ctx.durationMs) ? ctx.durationMs : null,
      status_code: typeof ctx.statusCode === "number" && Number.isFinite(ctx.statusCode) ? ctx.statusCode : null
    },
    action: {
      route_group: ctx.routeGroup || ctx.rateLimit?.group || null,
      method: ctx.method,
      path: ctx.path,
      event: ctx.auditEvent || null,
      entity_type: entity.entityType,
      entity_id: entity.entityId
    },
    security,
    policy: ctx.policy || {},
    payload: ctx.body || {},
    rateLimit: ctx.rateLimit || null,
    idempotency: ctx.idempotency || null,
    outcome: inferOutcome(ctx)
  };
}

export function withApiMiddlewares(handler: any, options: any = {}) {
  const resolved: any = { ...DEFAULT_OPTIONS, ...options };

  return async function apiHandler(req, res) {
    const ctx: any = createRequestContext(req);
    ctx.routeGroup = resolved.routeGroup || matchRouteGroupFromRequest(req) || null;
    applyCanonicalBody(req, ctx);
    await applyAuthStub(req, ctx);

    const cors = resolveCorsOptions(resolved);
    const corsResult = applyCorsHeaders(req, res, cors, ctx.path);
    if (ctx.method === "OPTIONS" && corsResult.applied && req?.headers?.["access-control-request-method"]) {
      // Preflight requests should not be rate-limited, audited, or idempotent.
      sendJson(res, 204, { ok: true }, {});
      ctx.response = jsonResponse(204, { ok: true }, {});
      return;
    }

      let idempotencyContext = null;

    try {
      if (resolved.enableRateLimit) {
        // Add an extra safety bucket for in-browser WebMCP tool invocation, in addition to the route-group limits.
        if (isWebMcpChannelRequest(req)) {
          const webmcpRateLimitResult = await rateLimitMiddleware(req, {
            routeGroup: "webmcp.tool_invoke",
            agentId: ctx.agentId,
            ownerId: ctx.ownerId,
            channelId: ctx.channelId,
            ip: ctx.ip,
            env: process.env,
            onRateLimited: (meta) => {
              ctx.rateLimit = {
                group: meta.group,
                scope: meta.scope,
                identity: meta.identity,
                limit: meta.limit,
                windowSeconds: meta.windowSeconds,
                retryAfterSeconds: meta.retryAfterSeconds,
                remaining: meta.remaining,
                resetSeconds: meta.resetSeconds
              };
            }
          });

          if (webmcpRateLimitResult && webmcpRateLimitResult.status === 429) {
            ctx.outcome = { type: "BLOCKED", reason: "rate_limit" };
            if (webmcpRateLimitResult.meta) {
              const meta: any = webmcpRateLimitResult.meta;
              ctx.rateLimit = {
                group: meta.group || "webmcp.tool_invoke",
                scope: meta.scope,
                identity: meta.identity,
                limit: meta.limit,
                remaining: meta.remaining,
                resetSeconds: meta.resetSeconds,
                retryAfterSeconds: meta.retryAfterSeconds
              };
            }
            sendJson(res, webmcpRateLimitResult.status, webmcpRateLimitResult.body, webmcpRateLimitResult.headers);
            ctx.response = jsonResponse(webmcpRateLimitResult.status, webmcpRateLimitResult.body, webmcpRateLimitResult.headers);
            return;
          }
        }

        const rateLimitResult = await rateLimitMiddleware(req, {
          routeGroup: resolved.routeGroup,
          agentId: ctx.agentId,
          ownerId: ctx.ownerId,
          channelId: ctx.channelId,
          ip: ctx.ip,
          env: process.env,
          onRateLimited: (meta) => {
            ctx.rateLimit = {
              group: meta.group,
              scope: meta.scope,
              identity: meta.identity,
              limit: meta.limit,
              windowSeconds: meta.windowSeconds,
              retryAfterSeconds: meta.retryAfterSeconds,
              remaining: meta.remaining,
              resetSeconds: meta.resetSeconds
            };
          }
        });

        if (rateLimitResult && rateLimitResult.status === 429) {
          ctx.outcome = { type: "BLOCKED", reason: "rate_limit" };
          if (rateLimitResult.meta) {
            const meta: any = rateLimitResult.meta;
            ctx.rateLimit = {
              group: meta.group || resolved.routeGroup || null,
              scope: meta.scope,
              identity: meta.identity,
              limit: meta.limit,
              remaining: meta.remaining,
              resetSeconds: meta.resetSeconds,
              retryAfterSeconds: meta.retryAfterSeconds
            };
          }
          sendJson(res, rateLimitResult.status, rateLimitResult.body, rateLimitResult.headers);
          ctx.response = jsonResponse(rateLimitResult.status, rateLimitResult.body, rateLimitResult.headers);
          return;
        }
        if (rateLimitResult?.meta) {
          const meta: any = rateLimitResult.meta;
          ctx.rateLimit = {
            group: meta.group || resolved.routeGroup || null,
            scope: meta.scope,
            identity: meta.identity
          };
          if (!ctx.routeGroup) {
            ctx.routeGroup = meta.group || resolved.routeGroup || null;
          }
        }
      }

      if (resolved.enableIdempotency && isWriteMethod(ctx.method)) {
        const idemResult = await beginIdempotency(req, ctx, {
          enabled: true,
          useIpFallback: resolved.idempotencyUseIpFallback === true,
          ip: ctx.ip
        });
        if (idemResult.action === "error") {
          ctx.outcome = { type: "BLOCKED", reason: "idempotency" };
          sendJson(res, idemResult.response.status, idemResult.response.body, idemResult.response.headers);
          ctx.response = idemResult.response;
          return;
        }
        if (idemResult.action === "replay") {
          ctx.idempotency = {
            key: idemResult.context?.key,
            replayed: true,
            status: idemResult.context?.record?.status
          };
          sendJson(res, idemResult.response.status, idemResult.response.body, idemResult.response.headers);
          ctx.response = idemResult.response;
          return;
        }
        if (idemResult.action === "continue") {
          idempotencyContext = idemResult.context;
          ctx.idempotency = {
            key: idemResult.context?.key,
            replayed: false,
            status: "IN_PROGRESS"
          };
        }
      }

      const result = await handler(req, res, ctx);
      if (result && !res.writableEnded) {
        sendJson(res, result.status, result.body, result.headers);
      }

      if (result) {
        ctx.response = result;
      } else if (res.writableEnded) {
        ctx.response = {
          status: res.statusCode || 200,
          body: null,
          headers: {}
        };
      }

      if (idempotencyContext && ctx.response) {
        try {
          await finalizeIdempotency(idempotencyContext, ctx.response);
          ctx.idempotency = {
            ...ctx.idempotency,
            status: ctx.response.status >= 500 ? "FAILED" : "COMPLETED"
          };
        } catch (error) {
          console.error("[idempotency] finalize failed", error);
        }
      }
    } catch (error) {
      ctx.outcome = { type: "FAILURE", reason: "exception" };
      if (!res.writableEnded) {
        sendError(res, 500, "INTERNAL_ERROR", "Unexpected error");
      }
      if (idempotencyContext) {
        try {
          await finalizeIdempotency(idempotencyContext, {
            status: 500,
            body: { error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
            headers: {}
          });
        } catch (finalizeError) {
          console.error("[idempotency] finalize failed", finalizeError);
        }
      }
    } finally {
      const startedAtMs =
        ctx?.startedAt instanceof Date && !Number.isNaN(ctx.startedAt.getTime()) ? ctx.startedAt.getTime() : null;
      if (startedAtMs !== null) {
        const durationMs = Date.now() - startedAtMs;
        if (Number.isFinite(durationMs) && durationMs >= 0) {
          ctx.durationMs = durationMs;
        }
      }
      if (ctx?.response?.status && typeof ctx.response.status === "number") {
        ctx.statusCode = ctx.response.status;
      } else if (typeof res?.statusCode === "number" && Number.isFinite(res.statusCode) && res.statusCode > 0) {
        ctx.statusCode = res.statusCode;
      }
      if (resolved.enableAudit) {
        mergeTrustContextIntoPolicy(ctx);
        await safeAuditLog(buildAuditEvent(ctx));
      }
    }
  };
}
