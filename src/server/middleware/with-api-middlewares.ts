import { createRequestContext } from "./request-context";
import { applyCanonicalBody } from "./body";
import { applyAuthStub } from "./auth-stub";
import { rateLimitMiddleware } from "../rate-limit/middleware";
import { beginIdempotency, finalizeIdempotency } from "../idempotency/middleware";
import { jsonResponse, sendJson } from "../http/response";
import { errorPayload, sendError } from "../http/errors";
import { mergeTrustContextIntoPolicy } from "../trustscore/context";
import { safeAuditLog } from "../audit/singleton";
import { matchRouteGroupFromRequest } from "../routes/route-groups";
import { getInstallationOauthScopes } from "../services/installation-scopes-cache";
import { sortScopesStable } from "../../shared/scopes/v1";

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

const FAIL_CLOSED_PROTECTION_ROUTE_GROUPS = new Set([
  "auth.session.start",
  "auth.session.confirm",
  "auth.session.end",
  "approvals.approve",
  "approvals.deny",
  "approvals.write",
  "console.approvals.write",
  "channels.pairing_confirm",
  "channels.pairings.write",
  "console.moderation.write",
  "console.reports.write",
  "console.risk_rules.write",
  "connect.claims.read",
  "evidence.write",
  "ops.psp.write",
  "owner.identities.delete",
  "owner.identities.write",
  "policies.write",
  "psp.webhooks",
  "ratings.create",
  "reports.create",
  "sellers.psp.write"
]);

const FAIL_CLOSED_PROTECTION_ROUTE_GROUP_PREFIXES = [
  "agents.keys.",
  "agent.keys.",
  "connect.sessions.",
  "contact_reveal.",
  "disputes.",
  "escrows.",
  "installations.",
  "offers.",
  "owner.verify_",
  "transactions."
];

function shouldFailClosedProtections(routeGroup: any): boolean {
  if (!routeGroup || typeof routeGroup !== "string") return false;
  return (
    FAIL_CLOSED_PROTECTION_ROUTE_GROUPS.has(routeGroup) ||
    FAIL_CLOSED_PROTECTION_ROUTE_GROUP_PREFIXES.some((prefix) => routeGroup.startsWith(prefix))
  );
}

function buildProtectionUnavailableResponse(protection: "rate_limit" | "idempotency") {
  const isIdempotency = protection === "idempotency";
  return jsonResponse(
    503,
    errorPayload(
      isIdempotency ? "IDEMPOTENCY_UNAVAILABLE" : "RATE_LIMIT_UNAVAILABLE",
      isIdempotency ? "Idempotency protection unavailable" : "Rate limit protection unavailable",
      { protection }
    ),
    { "Retry-After": "1" }
  );
}

function blockUnavailableProtection(res: any, ctx: any, protection: "rate_limit" | "idempotency") {
  const response = buildProtectionUnavailableResponse(protection);
  ctx.outcome = { type: "BLOCKED", reason: `${protection}_unavailable` };
  ctx.security = {
    ...(ctx.security || {}),
    fail_closed_protection: protection,
    route_group: ctx.routeGroup || null
  };
  if (!res.writableEnded) {
    sendJson(res, response.status, response.body, response.headers);
  }
  ctx.response = response;
  return response;
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

const ROUTE_GROUP_REQUIRED_SCOPES: Record<string, string[]> = {
  "watchlists.read": ["watchlists:read"],
  "watchlists.write": ["watchlists:write"],
  "listings.read": ["listings:read"],
  "listings.create": ["listings:write"],
  "listings.write": ["listings:write"],
  "threads.read": ["threads:read"],
  "threads.watch": ["threads:read"],
  "threads.create": ["threads:write"],
  "messages.send": ["threads:write"],
  "offers.create": ["offers:write"],
  "offers.actions": ["offers:write"],
  "offers.write": ["offers:write"],
  "transactions.actions": ["transactions:write"],
  "ratings.create": ["ratings:write"],
  "deals.read": ["deals:read"],
  "deals.comments.read": ["deals:read"],
  "deals.create": ["deals:write"],
  "deals.update": ["deals:write"],
  "deals.delete": ["deals:write"],
  "deals.vote": ["deals:write"],
  "deals.comments.create": ["deals:write"],
  "reports.create": ["reports:write"],
  "sse.connect": ["notifications:read"],
  "sse.reconnect_ip": ["notifications:read"],
  "policies.read": ["policies:*"],
  "policies.write": ["policies:*"],
  "audit.export": ["audit:export"],
  // Only enforced for installation-scoped agent credentials. Owner console uses owner actor.
  "approvals.read": ["approvals:admin"],
  "approvals.approve": ["approvals:admin"],
  "approvals.deny": ["approvals:admin"],
  "contact_reveal.request": ["contacts:reveal"],
  "disputes.open": ["escrow:*"],
  "evidence.read": ["evidence:read"],
  "evidence.write": ["evidence:write"],
  "escrows.create": ["escrow:*"],
  "escrows.pay": ["escrow:*"],
  "escrows.mark_delivered": ["escrow:*"],
  "escrows.confirm_received": ["escrow:*", "payout:*"]
};

export function resolveRequiredScopesForRouteGroup(routeGroup: any): string[] | null {
  if (!routeGroup || typeof routeGroup !== "string") return null;
  const required = ROUTE_GROUP_REQUIRED_SCOPES[routeGroup];
  if (!required || required.length === 0) return null;
  return sortScopesStable(required);
}

export async function enforceInstallationScopesForRouteGroup(ctx: any, routeGroup: any) {
  // Enforce scopes only for installation-scoped credentials.
  if (ctx?.authError) return null;
  if (ctx?.actor?.type !== "agent") return null;
  if (!ctx?.installationId) return null;

  const requiredScopes = resolveRequiredScopesForRouteGroup(routeGroup);
  if (!requiredScopes) return null;

  let grantedScopes: string[] = [];
  try {
    grantedScopes = await getInstallationOauthScopes(String(ctx.installationId));
  } catch (error: any) {
    const status = error?.status || 503;
    const code = error?.code || "AUTH_UNAVAILABLE";
    const message = error?.message || "Failed to load installation scopes";
    return jsonResponse(status, errorPayload(code, message));
  }

  const granted = new Set(Array.isArray(grantedScopes) ? grantedScopes : []);

  const missing = requiredScopes.filter((scope) => !granted.has(scope));
  if (missing.length === 0) return null;

  if (ctx) {
    ctx.outcome = { type: "BLOCKED", reason: "scope" };
    ctx.security = {
      ...(ctx.security || {}),
      installation_id: ctx.installationId,
      required_scopes: requiredScopes,
      missing_scopes: missing
    };
  }

  const response = jsonResponse(
    403,
    errorPayload("INSUFFICIENT_SCOPE", "Insufficient scope", {
      installation_id: ctx.installationId,
      required_scopes: requiredScopes
    })
  );

  return response;
}

async function enforceInstallationScopes(res: any, ctx: any) {
  const response = await enforceInstallationScopesForRouteGroup(ctx, ctx?.routeGroup);
  if (response && !res.writableEnded) {
    sendJson(res, response.status, response.body, response.headers);
  }
  return response;
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
    const failClosedProtections = shouldFailClosedProtections(ctx.routeGroup);
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
      // TI-331: installation-scoped OAuth scopes (v1).
      // Keep this before rate limiting / idempotency: blocked requests should not consume limits or locks.
      const scopesResponse = await enforceInstallationScopes(res, ctx);
      if (scopesResponse) {
        ctx.response = scopesResponse;
        return;
      }

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

        let rateLimitResult: any = null;
        try {
          rateLimitResult = await rateLimitMiddleware(req, {
            routeGroup: ctx.routeGroup || resolved.routeGroup,
            agentId: ctx.agentId,
            ownerId: ctx.ownerId,
            channelId: ctx.channelId,
            ip: ctx.ip,
            env: process.env,
            failOpen: !failClosedProtections,
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
        } catch (error) {
          if (failClosedProtections) {
            blockUnavailableProtection(res, ctx, "rate_limit");
            return;
          }
          throw error;
        }

        if (rateLimitResult && rateLimitResult.status >= 400) {
          ctx.outcome = {
            type: "BLOCKED",
            reason: rateLimitResult.status === 429 ? "rate_limit" : "rate_limit_unavailable"
          };
          if (rateLimitResult.meta) {
            const meta: any = rateLimitResult.meta;
            ctx.rateLimit = {
              group: meta.group || ctx.routeGroup || resolved.routeGroup || null,
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
            group: meta.group || ctx.routeGroup || resolved.routeGroup || null,
            scope: meta.scope,
            identity: meta.identity
          };
          if (!ctx.routeGroup) {
            ctx.routeGroup = meta.group || resolved.routeGroup || null;
          }
        }
      }

      if (resolved.enableIdempotency && isWriteMethod(ctx.method)) {
        let idemResult: any;
        try {
          idemResult = await beginIdempotency(req, ctx, {
            enabled: true,
            useIpFallback: resolved.idempotencyUseIpFallback === true,
            ip: ctx.ip,
            failOpen: !failClosedProtections
          });
        } catch (error) {
          if (failClosedProtections) {
            blockUnavailableProtection(res, ctx, "idempotency");
            return;
          }
          throw error;
        }
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
