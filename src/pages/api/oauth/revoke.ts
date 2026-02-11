import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { rateLimitMiddleware } from "../../../server/rate-limit/middleware";
import { getOauthRefreshTokenRecordByToken, revokeRefreshToken } from "../../../server/services/oauth-refresh-tokens";
import {
  getOauthAccessTokenRecordByToken,
  revokeOauthAccessToken
} from "../../../server/services/oauth-access-tokens";

type OauthRevocationTokenType = "refresh_token" | "access_token";

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

function normalizeTokenTypeHint(value: any): OauthRevocationTokenType | null {
  const tokenTypeHint = typeof value === "string" ? value.trim() : "";
  if (tokenTypeHint === "refresh_token" || tokenTypeHint === "access_token") {
    return tokenTypeHint;
  }
  return null;
}

function resolveLookupOrder(tokenTypeHint: OauthRevocationTokenType | null): OauthRevocationTokenType[] {
  if (tokenTypeHint === "access_token") {
    return ["access_token", "refresh_token"];
  }
  if (tokenTypeHint === "refresh_token") {
    return ["refresh_token", "access_token"];
  }
  return ["refresh_token", "access_token"];
}

function normalizeOwnerId(ownerId: any): string | null {
  if (ownerId === null || ownerId === undefined) return null;
  const value = String(ownerId).trim();
  return value ? value : null;
}

async function lookupOauthAccessTokenRecordByTokenCompat({ accessToken }: { accessToken: string }) {
  return getOauthAccessTokenRecordByToken({ accessToken });
}

async function revokeOauthAccessTokenCompat({
  accessToken,
  now = new Date()
}: {
  accessToken: string;
  now?: Date;
}) {
  return revokeOauthAccessToken({ accessToken, now });
}

async function lookupByTokenType({
  tokenType,
  token
}: {
  tokenType: OauthRevocationTokenType;
  token: string;
}): Promise<{ found: boolean; ownerId: string | null }> {
  const found =
    tokenType === "refresh_token"
      ? await getOauthRefreshTokenRecordByToken({ refreshToken: token })
      : await lookupOauthAccessTokenRecordByTokenCompat({ accessToken: token });

  if (!found?.record) {
    return { found: false, ownerId: null };
  }

  return {
    found: true,
    ownerId: normalizeOwnerId(found.record.owner_id)
  };
}

async function revokeByTokenType({
  tokenType,
  token,
  now
}: {
  tokenType: OauthRevocationTokenType;
  token: string;
  now: Date;
}) {
  if (tokenType === "refresh_token") {
    return revokeRefreshToken({ refreshToken: token, now });
  }
  return revokeOauthAccessTokenCompat({ accessToken: token, now });
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
  const tokenTypeHint = normalizeTokenTypeHint(tokenTypeHintRaw);
  const lookupOrder = resolveLookupOrder(tokenTypeHint);

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
  for (const tokenType of lookupOrder) {
    try {
      const found = await lookupByTokenType({ tokenType, token });
      if (found.found) {
        ownerId = found.ownerId;
        break;
      }
    } catch (error: any) {
      if (error?.status && error.status >= 500) {
        return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
      }
    }
  }

  const rateLimitResult = await rateLimitMiddleware(req, {
    routeGroup: "oauth.revoke",
    ownerId,
    ip: ctx?.ip,
    env: process.env,
    onRateLimited: (meta: any) => applyRateLimitResultToCtx(ctx, meta)
  });

  if (rateLimitResult && rateLimitResult.status === 429) {
    if (ctx) ctx.outcome = { type: "BLOCKED", reason: "rate_limit" };
    return jsonResponse(rateLimitResult.status, rateLimitResult.body, rateLimitResult.headers);
  }

  let revokeResult: { tokenType: OauthRevocationTokenType; payload: any } | null = null;
  const now = new Date();

  for (const tokenType of lookupOrder) {
    try {
      const result = await revokeByTokenType({ tokenType, token, now });
      if (result?.found || result?.revoked) {
        revokeResult = { tokenType, payload: result };
        break;
      }
    } catch (error: any) {
      if (error?.status && error.status >= 500) {
        return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
      }
      // RFC 7009: never reveal token validity; keep trying other supported token types.
    }
  }

  if (ctx) {
    if (revokeResult?.tokenType === "refresh_token") {
      ctx.auditEntityType = "oauth_refresh_token";
      ctx.auditEntityId = revokeResult.payload?.token_id || null;
      ctx.security = {
        ...(ctx.security || {}),
        refresh_token_id: revokeResult.payload?.token_id || null,
        refresh_token_hash: revokeResult.payload?.token_hash || null
      };
    } else if (revokeResult?.tokenType === "access_token") {
      const accessTokenHash =
        revokeResult.payload?.access_token_hash ??
        revokeResult.payload?.token_hash ??
        null;
      const accessTokenId =
        revokeResult.payload?.access_token_id ??
        revokeResult.payload?.token_id ??
        null;
      ctx.auditEntityType = "oauth_access_token";
      ctx.auditEntityId = accessTokenId;
      ctx.security = {
        ...(ctx.security || {}),
        access_token_id: accessTokenId,
        access_token_hash: accessTokenHash
      };
    } else if (tokenTypeHint === "refresh_token") {
      ctx.security = {
        ...(ctx.security || {}),
        refresh_token_hash: null
      };
    } else if (tokenTypeHint === "access_token") {
      ctx.security = {
        ...(ctx.security || {}),
        access_token_hash: null
      };
    } else {
      ctx.security = {
        ...(ctx.security || {}),
        refresh_token_hash: null,
        access_token_hash: null
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
