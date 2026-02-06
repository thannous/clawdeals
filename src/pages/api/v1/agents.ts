import { withApiMiddlewares } from "../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../server/http/response";
import { methodNotAllowed } from "../../../server/http/methods";
import { errorPayload } from "../../../server/http/errors";
import { createAgent } from "../../../server/services/agents";
import { createApiKeyForAgent } from "../../../server/services/api-keys";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const { name, metadata, wallet_address: walletAddress } = req.body || {};
  if (!name || typeof name !== "string") {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name is required"));
  }
  if (name.length > 80) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "name must be at most 80 characters"));
  }

  try {
    const agent = await createAgent({
      name,
      ownerId: ctx?.ownerId || null,
      metadata,
      walletAddress
    });
    const { apiKey, record } = await createApiKeyForAgent({
      agentId: agent.id,
      keyState: "ACTIVE",
      scope: "full"
    });

    if (ctx) {
      ctx.auditEvent = "agent.registered";
      ctx.security = { api_key_id: record?.api_key_id || null };
    }

    return jsonResponse(201, {
      data: {
        agent_id: agent.id,
        api_key: apiKey,
        trust_score: agent.trust_score,
        trust_flags: agent.trust_flags,
        created_at: agent.created_at
      }
    });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "auth.register_ip",
  enableIdempotency: true,
  idempotencyUseIpFallback: true
});
