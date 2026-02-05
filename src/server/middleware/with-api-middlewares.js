import { createRequestContext } from "./request-context";
import { applyCanonicalBody } from "./body";
import { applyAuthStub } from "./auth-stub";
import { rateLimitMiddleware } from "../rate-limit/middleware";
import { beginIdempotency, finalizeIdempotency } from "../idempotency/middleware";
import { jsonResponse, sendJson } from "../http/response";
import { sendError } from "../http/errors";
import { mergeTrustContextIntoPolicy } from "../trustscore/context";
import { safeAuditLog } from "../audit/singleton.js";

const DEFAULT_OPTIONS = {
  enableRateLimit: true,
  enableIdempotency: true,
  enableAudit: true,
  idempotencyUseIpFallback: false
};

function isWriteMethod(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

// safeAuditLog is imported from ../audit/singleton.js

function inferOutcome(ctx) {
  if (ctx.outcome?.type) return ctx.outcome.type;
  const status = ctx.response?.status;
  if (!status) return "UNKNOWN";
  if (status < 400) return "SUCCESS";
  return "FAILURE";
}

function buildAuditEvent(ctx) {
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
      query: ctx.query
    },
    action: {
      route_group: ctx.rateLimit?.group || null,
      method: ctx.method,
      path: ctx.path,
      event: ctx.auditEvent || null
    },
    security: ctx.security || {},
    policy: ctx.policy || {},
    payload: ctx.body || {},
    rateLimit: ctx.rateLimit || null,
    idempotency: ctx.idempotency || null,
    outcome: inferOutcome(ctx)
  };
}

export function withApiMiddlewares(handler, options = {}) {
  const resolved = { ...DEFAULT_OPTIONS, ...options };

  return async function apiHandler(req, res) {
    const ctx = createRequestContext(req);
    applyCanonicalBody(req, ctx);
    await applyAuthStub(req, ctx);

    let idempotencyContext = null;

    try {
      if (resolved.enableRateLimit) {
        const rateLimitResult = await rateLimitMiddleware(req, {
          routeGroup: resolved.routeGroup,
          agentId: ctx.agentId,
          ownerId: ctx.ownerId,
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
            ctx.rateLimit = {
              group: rateLimitResult.meta.group || resolved.routeGroup || null,
              scope: rateLimitResult.meta.scope,
              identity: rateLimitResult.meta.identity,
              limit: rateLimitResult.meta.limit,
              remaining: rateLimitResult.meta.remaining,
              resetSeconds: rateLimitResult.meta.resetSeconds,
              retryAfterSeconds: rateLimitResult.meta.retryAfterSeconds
            };
          }
          sendJson(res, rateLimitResult.status, rateLimitResult.body, rateLimitResult.headers);
          ctx.response = jsonResponse(rateLimitResult.status, rateLimitResult.body, rateLimitResult.headers);
          return;
        }
        if (rateLimitResult?.meta) {
          ctx.rateLimit = {
            group: rateLimitResult.meta.group || resolved.routeGroup || null,
            scope: rateLimitResult.meta.scope,
            identity: rateLimitResult.meta.identity
          };
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
      if (resolved.enableAudit) {
        mergeTrustContextIntoPolicy(ctx);
        await safeAuditLog(buildAuditEvent(ctx));
      }
    }
  };
}
