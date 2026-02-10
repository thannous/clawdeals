import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { rateLimitMiddleware } from "../../../../../server/rate-limit/middleware";
import { getConnectSessionForPoll, hashConnectSessionPollToken } from "../../../../../server/services/connect-sessions";

function getHeaderValue(req: any, name: string) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function parseBearerToken(value: any) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const sessionId = String(resolveParam(req.query?.session_id) || "").trim();
  if (!sessionId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "session_id is required"));
  }

  const authHeader = getHeaderValue(req, "authorization");
  if (!authHeader) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Authentication required"));
  }

  const pollToken = parseBearerToken(authHeader);
  if (!pollToken) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Invalid Authorization header"));
  }

  if (ctx) {
    ctx.auditEvent = "connect.session_polled";
    ctx.auditEntityType = "connect_session";
    ctx.auditEntityId = sessionId;
  }

  let pollTokenHash: string;
  try {
    pollTokenHash = hashConnectSessionPollToken(pollToken);
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }

  const rateLimitResult = await rateLimitMiddleware(req, {
    routeGroup: "connect.sessions.poll_token",
    agentId: pollTokenHash,
    useIpFallback: false,
    env: process.env,
    onRateLimited: (meta: any) => {
      if (!ctx) return;
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
    if (ctx) {
      ctx.outcome = { type: "BLOCKED", reason: "rate_limit" };
      if (rateLimitResult.meta) {
        const meta: any = rateLimitResult.meta;
        ctx.rateLimit = {
          group: meta.group || "connect.sessions.poll_token",
          scope: meta.scope,
          identity: meta.identity,
          limit: meta.limit,
          remaining: meta.remaining,
          resetSeconds: meta.resetSeconds,
          retryAfterSeconds: meta.retryAfterSeconds
        };
      }
    }
    return jsonResponse(rateLimitResult.status, rateLimitResult.body, rateLimitResult.headers);
  }

  if (rateLimitResult?.meta && ctx) {
    const meta: any = rateLimitResult.meta;
    ctx.rateLimit = {
      group: meta.group || "connect.sessions.poll_token",
      scope: meta.scope,
      identity: meta.identity
    };
  }

  try {
    const session = await getConnectSessionForPoll({
      sessionId,
      pollToken,
      now: new Date()
    });

    if (ctx) {
      ctx.security = {
        ...(ctx.security || {}),
        session_id: session?.session_id || null,
        poll_token_hash: pollTokenHash
      };
      ctx.auditEntityId = session?.session_id || sessionId;
    }

    return jsonResponse(200, {
      data: {
        session_id: session.session_id,
        status: session.status,
        claimed_at: session.claimed_at ?? null,
        expires_at: session.expires_at
      }
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "connect.sessions.poll_token",
  enableRateLimit: false,
  enableIdempotency: false
});

