import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { errorPayload } from "../../../../../../server/http/errors";
import { isUuid } from "../../../../../../server/utils/validators";
import { rateLimitMiddleware } from "../../../../../../server/rate-limit/middleware";
import { beginIdempotency, finalizeIdempotency } from "../../../../../../server/idempotency/middleware";
import { getConnectSessionForPoll, hashConnectSessionPollToken } from "../../../../../../server/services/connect-sessions";
import { exchangeConnectSessionForInstallationApiKey } from "../../../../../../server/services/connect-session-exchange";

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

function normalizeOptionalString(value: any, maxLen: number) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  // This endpoint is internet-facing; apply an IP-scoped limiter first so callers can't bypass
  // protections by varying untrusted poll tokens / hashes.
  const ipRateLimitResult = await rateLimitMiddleware(req, {
    routeGroup: "connect.sessions.exchange_ip",
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

  if (ipRateLimitResult && ipRateLimitResult.status === 429) {
    if (ctx) {
      ctx.outcome = { type: "BLOCKED", reason: "rate_limit" };
    }
    return jsonResponse(ipRateLimitResult.status, ipRateLimitResult.body, ipRateLimitResult.headers);
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const sessionId = resolveParam(req.query?.session_id);
  if (!isUuid(sessionId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "session_id must be a UUID"));
  }

  const authHeader = getHeaderValue(req, "authorization");
  if (!authHeader) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Authentication required"));
  }

  const pollToken = parseBearerToken(authHeader);
  if (!pollToken) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Invalid Authorization header"));
  }

  let pollTokenHash: string;
  try {
    pollTokenHash = hashConnectSessionPollToken(pollToken);
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }

  if (ctx) {
    ctx.auditEvent = "connect.exchange";
    ctx.auditEntityType = "connect_session";
    ctx.auditEntityId = String(sessionId);
    ctx.security = {
      ...(ctx.security || {}),
      session_id: String(sessionId),
      poll_token_hash: pollTokenHash
    };
  }

  const rateLimitResult = await rateLimitMiddleware(req, {
    routeGroup: "connect.sessions.exchange",
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
          group: meta.group || "connect.sessions.exchange",
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

  // Validate that (session_id, poll_token) matches a real connect session before creating an
  // idempotency record. Otherwise an attacker can fill the idempotency store by varying tokens.
  const now = new Date();
  try {
    await getConnectSessionForPoll({
      sessionId: String(sessionId),
      pollToken,
      now
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }

  let idempotencyContext: any = null;
  const originalActor = ctx?.actor;
  try {
    if (ctx) {
      // Idempotency is scoped per poll_token_hash (per session) so the secret can be replayed safely.
      ctx.actor = { type: "agent", id: pollTokenHash };
    }

    const idemResult = await beginIdempotency(req, ctx, {
      enabled: true,
      useIpFallback: false,
      ttlSeconds: 10 * 60,
      strictReplayTtl: true
    });

    if (idemResult.action === "error") {
      if (ctx) {
        ctx.outcome = { type: "BLOCKED", reason: "idempotency" };
      }
      return idemResult.response;
    }
    if (idemResult.action === "replay") {
      if (ctx) {
        ctx.idempotency = {
          key: idemResult.context?.key,
          replayed: true,
          status: idemResult.context?.record?.status
        };
      }
      return idemResult.response;
    }
    if (idemResult.action === "continue") {
      idempotencyContext = idemResult.context;
      if (ctx) {
        ctx.idempotency = {
          key: idemResult.context?.key,
          replayed: false,
          status: "IN_PROGRESS"
        };
      }
    }
  } finally {
    if (ctx) {
      ctx.actor = originalActor;
    }
  }

  let response: any = null;
  try {
    const body = req.body || {};

    const requestedKeyScope = typeof body.requested_key_scope === "string" ? body.requested_key_scope.trim() : "";
    if (!requestedKeyScope) {
      response = jsonResponse(400, errorPayload("VALIDATION_ERROR", "requested_key_scope is required"));
      return response;
    }
    if (requestedKeyScope !== "agent_write") {
      response = jsonResponse(400, errorPayload("VALIDATION_ERROR", "requested_key_scope must be agent_write"));
      return response;
    }

    const installation = body.installation || {};
    if (!installation || typeof installation !== "object") {
      response = jsonResponse(400, errorPayload("VALIDATION_ERROR", "installation is required"));
      return response;
    }

    const clientType = normalizeOptionalString(installation.client_type, 40);
    if (!clientType) {
      response = jsonResponse(400, errorPayload("VALIDATION_ERROR", "installation.client_type is required"));
      return response;
    }

    const clientVersion = normalizeOptionalString(installation.client_version, 40);
    const deviceName = normalizeOptionalString(installation.device_name, 80);
    const fingerprint = normalizeOptionalString(installation.fingerprint, 512);

    const exchanged = await exchangeConnectSessionForInstallationApiKey({
      sessionId: String(sessionId),
      pollTokenHash,
      requestedScope: requestedKeyScope,
      installation: {
        clientType,
        clientVersion,
        deviceName,
        fingerprint
      },
      now
    });

    if (ctx) {
      ctx.auditEntityId = exchanged.session_id || String(sessionId);
      ctx.security = {
        ...(ctx.security || {}),
        agent_id: exchanged.agent_id,
        installation_id: exchanged.installation_id,
        api_key_id: exchanged.api_key_id
      };
    }

    response = jsonResponse(
      200,
      {
        data: {
          session_id: exchanged.session_id,
          status: exchanged.status,
          agent_id: exchanged.agent_id,
          installation_id: exchanged.installation_id,
          api_key: exchanged.api_key,
          api_key_id: exchanged.api_key_id,
          issued_at: exchanged.issued_at
        }
      },
      { "Cache-Control": "no-store" }
    );

    return response;
  } catch (error: any) {
    response = jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    return response;
  } finally {
    if (idempotencyContext && response) {
      try {
        await finalizeIdempotency(idempotencyContext, response);
        if (ctx?.idempotency) {
          ctx.idempotency = {
            ...ctx.idempotency,
            status: response.status >= 500 ? "FAILED" : "COMPLETED"
          };
        }
      } catch (finalizeError) {
        console.error("[idempotency] finalize failed", finalizeError);
      }
    }
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "connect.sessions.exchange",
  enableRateLimit: false,
  enableIdempotency: false
});
