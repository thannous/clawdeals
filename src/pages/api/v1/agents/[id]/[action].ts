import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getAgentById } from "../../../../../server/services/agents";
import {
  revokeApiKeyForAgent,
  revokeGlobalApiKeysForAgent,
  rotateApiKeyForAgent,
  rotateGlobalApiKeyForAgentIfPresent
} from "../../../../../server/services/api-keys";
import {
  listActiveInstallationsForOwnerAgent,
  revokeInstallationForOwner
} from "../../../../../server/services/agent-installations";

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

function requireIdempotencyKey(req) {
  const idemKey = resolveHeader(req, "idempotency-key");
  if (!idemKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
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

  const idemError = requireIdempotencyKey(req);
  if (idemError) return idemError;

  const result = await rotateApiKeyForAgent({ agentId });

  ctx.auditEvent = "agent.key_rotated";
  ctx.security = {
    api_key_id: result.apiKeyId,
    previous_api_key_id: result.previousApiKeyId
  };

  return jsonResponse(
    200,
    {
      data: {
        agent_id: agentId,
        api_key_id: result.apiKeyId,
        api_key: result.apiKey,
        rotated_at: result.rotatedAt.toISOString(),
        previous_api_key_id: result.previousApiKeyId,
        grace_seconds: result.graceSeconds
      }
    },
    { "Cache-Control": "no-store" }
  );
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

async function revokeSelectedAgentInstallationsFailFast({ ownerId, agentId, now }) {
  const rows = await listActiveInstallationsForOwnerAgent({ ownerId, agentId, limit: 100 });
  const revokedInstallationIds: string[] = [];

  for (const row of rows) {
    const installationId = row?.installation_id ? String(row.installation_id) : "";
    if (!installationId) continue;

    try {
      await revokeInstallationForOwner({
        ownerId,
        installationId,
        now
      });
      revokedInstallationIds.push(installationId);
    } catch (error: any) {
      const details = {
        ...(error?.details || {}),
        revoked_installation_ids: [...revokedInstallationIds],
        installation_id: installationId,
        failure_stage: "installation_revoke"
      };
      throw Object.assign(new Error(error?.message || "Failed to revoke installation"), {
        status: error?.status || 500,
        code: error?.code || "ERROR",
        details
      });
    }
  }

  return revokedInstallationIds;
}

async function handleRotateAll(req, ctx, agentId) {
  const ownerError = requireOwner(ctx);
  if (ownerError) return ownerError;

  const { error } = await ensureAgentOwner(agentId, ctx.ownerId);
  if (error) return error;

  const idemError = requireIdempotencyKey(req);
  if (idemError) return idemError;

  const now = new Date();
  const nowIso = now.toISOString();
  const ownerId = String(ctx.ownerId);

  try {
    const rotatedGlobal = await rotateGlobalApiKeyForAgentIfPresent({ agentId });
    const revokedInstallationIds = await revokeSelectedAgentInstallationsFailFast({
      ownerId,
      agentId,
      now
    });

    const responseData: any = {
      agent_id: agentId,
      rotated: Boolean(rotatedGlobal.rotated),
      revoked_installations_count: revokedInstallationIds.length,
      revoked_installation_ids: revokedInstallationIds,
      rotated_at: nowIso
    };

    if (rotatedGlobal.rotated) {
      responseData.api_key = rotatedGlobal.apiKey;
      responseData.api_key_id = rotatedGlobal.apiKeyId;
      responseData.previous_api_key_id = rotatedGlobal.previousApiKeyId;
      responseData.grace_seconds = rotatedGlobal.graceSeconds;
    }

    ctx.auditEvent = "agent.credentials_rotated";
    ctx.auditEntityType = "agent";
    ctx.auditEntityId = agentId;
    ctx.security = {
      agent_id: agentId,
      rotated_global_key: Boolean(rotatedGlobal.rotated),
      revoked_installation_ids: revokedInstallationIds,
      revoked_global_api_key_ids: [],
      api_key_id: rotatedGlobal.apiKeyId || null,
      previous_api_key_id: rotatedGlobal.previousApiKeyId || null
    };

    return jsonResponse(
      200,
      {
        data: responseData
      },
      { "Cache-Control": "no-store" }
    );
  } catch (error: any) {
    ctx.auditEvent = "agent.credentials_rotated";
    ctx.auditEntityType = "agent";
    ctx.auditEntityId = agentId;
    ctx.security = {
      ...(ctx.security || {}),
      agent_id: agentId,
      revoked_global_api_key_ids: [],
      revoked_installation_ids: error?.details?.revoked_installation_ids || [],
      failure_stage: error?.details?.failure_stage || "unknown",
      failed_installation_id: error?.details?.installation_id || null
    };
    return jsonResponse(error?.status || 500, errorPayload(error?.code || "ERROR", error?.message, error?.details));
  }
}

async function handleRevokeAll(req, ctx, agentId) {
  const ownerError = requireOwner(ctx);
  if (ownerError) return ownerError;

  const { error } = await ensureAgentOwner(agentId, ctx.ownerId);
  if (error) return error;

  const idemError = requireIdempotencyKey(req);
  if (idemError) return idemError;

  const now = new Date();
  const nowIso = now.toISOString();
  const ownerId = String(ctx.ownerId);
  let revokedGlobalApiKeyIds: string[] = [];

  try {
    const revokedGlobal = await revokeGlobalApiKeysForAgent({ agentId, now });
    revokedGlobalApiKeyIds = Array.isArray(revokedGlobal?.revokedGlobalApiKeyIds)
      ? revokedGlobal.revokedGlobalApiKeyIds.map((value) => String(value))
      : [];
    const revokedInstallationIds = await revokeSelectedAgentInstallationsFailFast({
      ownerId,
      agentId,
      now
    });

    ctx.auditEvent = "agent.credentials_revoked";
    ctx.auditEntityType = "agent";
    ctx.auditEntityId = agentId;
    ctx.security = {
      agent_id: agentId,
      revoked_global_api_key_ids: revokedGlobal.revokedGlobalApiKeyIds,
      revoked_installation_ids: revokedInstallationIds
    };

    return jsonResponse(200, {
      data: {
        agent_id: agentId,
        revoked_global_keys_count: revokedGlobal.revokedGlobalKeysCount,
        revoked_global_api_key_ids: revokedGlobal.revokedGlobalApiKeyIds,
        revoked_installations_count: revokedInstallationIds.length,
        revoked_installation_ids: revokedInstallationIds,
        revoked_at: nowIso
      }
    });
  } catch (error: any) {
    ctx.auditEvent = "agent.credentials_revoked";
    ctx.auditEntityType = "agent";
    ctx.auditEntityId = agentId;
    ctx.security = {
      ...(ctx.security || {}),
      agent_id: agentId,
      revoked_global_api_key_ids: revokedGlobalApiKeyIds,
      revoked_installation_ids: error?.details?.revoked_installation_ids || [],
      failure_stage: error?.details?.failure_stage || "unknown",
      failed_installation_id: error?.details?.installation_id || null
    };
    return jsonResponse(error?.status || 500, errorPayload(error?.code || "ERROR", error?.message, error?.details));
  }
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
    case "keys:rotate-all":
      return handleRotateAll(req, ctx, rawId);
    case "keys:revoke-all":
      return handleRevokeAll(req, ctx, rawId);
    default:
      return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown agent action"));
  }
}

export default withApiMiddlewares(handler, {
  enableIdempotency: true,
  enableRateLimit: true
});
