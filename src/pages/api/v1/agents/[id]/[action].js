import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getAgentById } from "../../../../../server/services/agents";
import { revokeApiKeyForAgent, rotateApiKeyForAgent } from "../../../../../server/services/api-keys";

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveHeader(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function requireOwner(ctx) {
  if (!ctx?.ownerId || ctx.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  return null;
}

async function ensureAgentOwner(agentId, ownerId) {
  const agent = await getAgentById(agentId);
  if (!agent) {
    return { error: jsonResponse(404, errorPayload("NOT_FOUND", "Agent not found")) };
  }
  if (agent.owner_id !== ownerId) {
    return { error: jsonResponse(403, errorPayload("FORBIDDEN", "Owner does not match agent")) };
  }
  return { agent };
}

async function handleRotate(req, ctx, agentId) {
  const ownerError = requireOwner(ctx);
  if (ownerError) return ownerError;

  const { error } = await ensureAgentOwner(agentId, ctx.ownerId);
  if (error) return error;

  const idemKey = resolveHeader(req, "idempotency-key");
  if (!idemKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const result = await rotateApiKeyForAgent({ agentId });

  ctx.auditEvent = "agent.key_rotated";
  ctx.security = {
    api_key_id: result.apiKeyId,
    previous_api_key_id: result.previousApiKeyId
  };

  return jsonResponse(200, {
    data: {
      agent_id: agentId,
      api_key_id: result.apiKeyId,
      api_key: result.apiKey,
      rotated_at: result.rotatedAt.toISOString(),
      previous_api_key_id: result.previousApiKeyId,
      grace_seconds: result.graceSeconds
    }
  });
}

async function handleRevoke(req, ctx, agentId) {
  const ownerError = requireOwner(ctx);
  if (ownerError) return ownerError;

  const { error } = await ensureAgentOwner(agentId, ctx.ownerId);
  if (error) return error;

  const { api_key_id: apiKeyId } = req.body || {};
  if (!apiKeyId || typeof apiKeyId !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "api_key_id is required"));
  }
  if (!isUuid(apiKeyId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "api_key_id must be a UUID"));
  }

  const revoked = await revokeApiKeyForAgent({ agentId, apiKeyId });

  ctx.auditEvent = "agent.key_revoked";
  ctx.security = {
    api_key_id: revoked.api_key_id
  };

  return jsonResponse(200, {
    data: {
      agent_id: agentId,
      api_key_id: revoked.api_key_id,
      revoked_at: revoked.revoked_at
    }
  });
}

export async function handler(req, _res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const rawId = resolveParam(req.query?.id);
  if (!isUuid(rawId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_id must be a UUID"));
  }

  const action = resolveParam(req.query?.action);
  switch (action) {
    case "keys:rotate":
      return handleRotate(req, ctx, rawId);
    case "keys:revoke":
      return handleRevoke(req, ctx, rawId);
    default:
      return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown agent action"));
  }
}

export default withApiMiddlewares(handler, {
  enableIdempotency: true,
  enableRateLimit: true
});
