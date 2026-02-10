import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { rateLimitMiddleware } from "../../../server/rate-limit/middleware";
import { getOauthRefreshTokenRecordByToken, revokeRefreshToken } from "../../../server/services/oauth-refresh-tokens";

function getHeaderValue(req: any, name: string) {
  const value = req?.headers?.[name] ?? req?.headers?.[String(name).toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseRevokeBody(req: any) {
  const body = req?.body;
  if (!body) return {};
  if (typeof body === "object") return body;
  if (typeof body !== "string") return {};

  const contentType = String(getHeaderValue(req, "content-type") || "");

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  try {
    const params = new URLSearchParams(body);
    const out: any = {};
    for (const [key, value] of params.entries()) {
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function sanitizeCtxBody(ctx: any, body: any) {
  if (!ctx) return;
  if (!body || typeof body !== "object") {
    ctx.body = {};
    return;
  }
  const copy: any = { ...body };
  delete copy.token;
  ctx.body = copy;
}

function applyRateLimitResultToCtx(ctx: any, meta: any) {
  if (!ctx || !meta) return;
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

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const body = parseRevokeBody(req);
  sanitizeCtxBody(ctx, body);

  const clientIdRaw = body.client_id ?? body.clientId ?? null;
  const clientId = typeof clientIdRaw === "string" ? clientIdRaw.trim() : "";
  if (!clientId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "client_id is required"));
  }
  if (clientId !== "openclaw") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "client_id must be 'openclaw'"));
  }

  const tokenTypeHintRaw = body.token_type_hint ?? body.tokenTypeHint ?? null;
  const tokenTypeHint = typeof tokenTypeHintRaw === "string" ? tokenTypeHintRaw.trim() : "";
  if (tokenTypeHint && tokenTypeHint !== "refresh_token") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "token_type_hint must be 'refresh_token'"));
  }

  const tokenRaw = body.token ?? null;
  const token = typeof tokenRaw === "string" ? tokenRaw.trim() : "";
  if (!token) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "token is required"));
  }

  if (ctx) {
    ctx.auditEvent = "oauth.token_revoked";
  }

  // Lookup first so we can rate-limit by owner when possible.
  let ownerId: string | null = null;
  try {
    const found = await getOauthRefreshTokenRecordByToken({ refreshToken: token });
    ownerId = found?.record?.owner_id ? String(found.record.owner_id) : null;
  } catch (error: any) {
    if (error?.status && error.status >= 500) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
    ownerId = null;
  }

  const rateLimitResult = await rateLimitMiddleware(req, {
    routeGroup: "oauth.revoke",
    ownerId,
    env: process.env,
    onRateLimited: (meta: any) => applyRateLimitResultToCtx(ctx, meta)
  });

  if (rateLimitResult && rateLimitResult.status === 429) {
    if (ctx) ctx.outcome = { type: "BLOCKED", reason: "rate_limit" };
    return jsonResponse(rateLimitResult.status, rateLimitResult.body, rateLimitResult.headers);
  }

  try {
    const result = await revokeRefreshToken({ refreshToken: token, now: new Date() });
    if (ctx) {
      ctx.auditEntityType = "oauth_refresh_token";
      ctx.auditEntityId = result.token_id || null;
      ctx.security = {
        ...(ctx.security || {}),
        refresh_token_id: result.token_id || null,
        refresh_token_hash: result.token_hash || null
      };
    }
  } catch (error: any) {
    // RFC 7009: never reveal token validity; still return 200.
    if (ctx) {
      ctx.security = {
        ...(ctx.security || {}),
        refresh_token_hash: null
      };
    }
  }

  return jsonResponse(200, {});
}

export default withApiMiddlewares(handler, {
  routeGroup: "oauth.revoke",
  enableRateLimit: false,
  enableIdempotency: false
});

