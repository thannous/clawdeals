import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { createAgent, deleteAgentById, getAgentById } from "../../../../server/services/agents";
import {
  approveOauthDeviceAuthorization,
  getOauthDeviceAuthorizationByUserCode
} from "../../../../server/services/oauth-device-authorizations";

function getHeaderValue(req: any, name: string) {
  const value = req.headers?.[name] ?? req.headers?.[String(name).toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveMode(body: any) {
  const raw = typeof body?.mode === "string" ? body.mode.trim().toLowerCase() : "create_agent";
  return raw === "attach_agent" ? "attach_agent" : "create_agent";
}

function resolveUserCode(body: any) {
  const raw = body?.user_code ?? body?.userCode ?? null;
  return typeof raw === "string" ? raw.trim() : "";
}

function sanitizeCtxBody(ctx: any, body: any) {
  if (!ctx) return;
  if (!body || typeof body !== "object") {
    ctx.body = {};
    return;
  }
  const copy: any = { ...body };
  delete copy.user_code;
  delete copy.userCode;
  ctx.body = copy;
}

function buildConflictFromStatus(status: any) {
  if (status === "AUTHORIZED") {
    return jsonResponse(
      409,
      errorPayload("DEVICE_AUTHORIZATION_ALREADY_AUTHORIZED", "Device authorization already authorized")
    );
  }
  if (status === "DENIED") {
    return jsonResponse(409, errorPayload("DEVICE_AUTHORIZATION_DENIED", "Device authorization denied"));
  }
  if (status === "EXPIRED") {
    return jsonResponse(409, errorPayload("DEVICE_AUTHORIZATION_EXPIRED", "Device authorization expired"));
  }
  return null;
}

export async function handler(req: any, res: any, ctx: any) {
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

  if (!ctx?.ownerId || ctx?.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ctx.ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "x-owner-id must be a UUID"));
  }

  const body = req.body || {};
  const userCode = resolveUserCode(body);
  sanitizeCtxBody(ctx, body);

  if (!userCode) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "user_code is required"));
  }

  const mode = resolveMode(body);

  let createdAgentId: string | null = null;
  try {
    const authorization = await getOauthDeviceAuthorizationByUserCode({ userCode, now: new Date() });

    const conflict = buildConflictFromStatus(authorization.status);
    if (conflict) return conflict;
    if (authorization.status !== "PENDING") {
      return jsonResponse(
        409,
        errorPayload("DEVICE_AUTHORIZATION_NOT_APPROVABLE", "Device authorization cannot be approved")
      );
    }

    if (ctx) {
      ctx.auditEvent = "oauth.device_approved";
      ctx.auditEntityType = "oauth_device_authorization";
      ctx.auditEntityId = authorization.authorization_id;
      ctx.security = {
        ...(ctx.security || {}),
        authorization_id: authorization.authorization_id || null,
        client_id: authorization.client_id || null,
        device_code_hash: authorization.device_code_hash || null,
        user_code_hash: authorization.user_code_hash || null
      };
    }

    let agentId: string | null = null;

    if (mode === "attach_agent") {
      const attachAgentId = typeof body.attach_agent_id === "string" ? body.attach_agent_id.trim() : "";
      if (!isUuid(attachAgentId)) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "attach_agent_id must be a UUID"));
      }

      const agent = await getAgentById(attachAgentId);
      if (!agent) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Agent not found"));
      }
      if (agent.owner_id !== ctx.ownerId) {
        return jsonResponse(403, errorPayload("PERMISSION_DENIED", "Agent does not belong to owner"));
      }

      agentId = attachAgentId;
    } else {
      const agentNameRaw = typeof body.agent_name === "string" ? body.agent_name.trim() : "";
      const agentName = (agentNameRaw || String(authorization.requested_agent_name || "") || "OpenClaw").trim();
      if (!agentName) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_name is required"));
      }
      if (agentName.length > 80) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_name must be at most 80 characters"));
      }

      const created = await createAgent({
        ownerId: ctx.ownerId,
        name: agentName,
        metadata: {
          oauth_client_id: authorization.client_id || null,
          oauth_device_authorization_id: authorization.authorization_id
        }
      });

      agentId = created?.id ? String(created.id) : null;
      createdAgentId = agentId;
      if (!agentId) {
        return jsonResponse(500, errorPayload("ERROR", "Failed to create agent"));
      }
    }

    const approved = await approveOauthDeviceAuthorization({
      userCode,
      ownerId: ctx.ownerId,
      agentId,
      now: new Date()
    });

    return jsonResponse(200, {
      data: {
        authorization_id: approved.authorization_id,
        status: approved.status,
        owner_id: approved.owner_id,
        agent_id: approved.agent_id,
        authorized_at: approved.authorized_at || null
      }
    });
  } catch (error: any) {
    // Best-effort cleanup to avoid orphan agents when an approve loses the race.
    if (createdAgentId) {
      try {
        await deleteAgentById(createdAgentId);
      } catch {
        // ignore
      }
    }
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "oauth.device.approve_ip",
  enableIdempotency: true,
  idempotencyUseIpFallback: true
});
