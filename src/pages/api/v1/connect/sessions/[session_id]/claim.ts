import { withApiMiddlewares } from "../../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../../server/http/methods";
import { errorPayload } from "../../../../../../server/http/errors";
import { isUuid } from "../../../../../../server/utils/validators";
import {
  createAgent,
  deleteAgentById,
  getAgentById,
  getOwnerAgentLimit,
  listOwnerAgentsForClaim
} from "../../../../../../server/services/agents";
import { createOrGetControlDmThread } from "../../../../../../server/services/threads";
import {
  claimConnectSession,
  getConnectSessionByClaimToken
} from "../../../../../../server/services/connect-sessions";

function getHeaderValue(req: any, name: string) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function resolveClaimToken(body: any) {
  const claimToken = body?.claim_token ?? body?.claimToken ?? null;
  return typeof claimToken === "string" ? claimToken.trim() : "";
}

function requireSameOriginForOwnerSession(req: any, ctx: any) {
  if (!ctx?.ownerSessionId) return null;
  const origin = getHeaderValue(req, "origin");
  const referer = getHeaderValue(req, "referer");
  const source = origin || referer;
  if (!source) {
    return jsonResponse(403, errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
  }

  const forwardedHost = getHeaderValue(req, "x-forwarded-host");
  const hostHeader = forwardedHost ? String(forwardedHost).split(",")[0].trim() : getHeaderValue(req, "host");
  if (!hostHeader) {
    return jsonResponse(403, errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
  }

  try {
    const sourceHost = new URL(String(source)).host;
    if (!sourceHost || sourceHost !== String(hostHeader)) {
      return jsonResponse(403, errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
    }
  } catch {
    return jsonResponse(403, errorPayload("CSRF_BLOCKED", "Cross-site request blocked"));
  }

  return null;
}

function resolveMode(body: any) {
  const raw = typeof body?.mode === "string" ? body.mode.trim().toLowerCase() : "create_agent";
  return raw === "attach_agent" ? "attach_agent" : "create_agent";
}

function buildConflictFromStatus(status: any) {
  if (status === "CLAIMED" || status === "DELIVERED") {
    return jsonResponse(409, errorPayload("SESSION_ALREADY_CLAIMED", "Connect session already claimed"));
  }
  if (status === "CANCELLED") {
    return jsonResponse(409, errorPayload("SESSION_CANCELLED", "Connect session cancelled"));
  }
  if (status === "EXPIRED") {
    return jsonResponse(409, errorPayload("SESSION_EXPIRED", "Connect session expired"));
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

  const sessionId = resolveParam(req.query?.session_id);
  if (!isUuid(sessionId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "session_id must be a UUID"));
  }

  if (!ctx?.ownerId || ctx?.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ctx.ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "x-owner-id must be a UUID"));
  }
  const csrfBlocked = requireSameOriginForOwnerSession(req, ctx);
  if (csrfBlocked) return csrfBlocked;

  const body = req.body || {};
  const claimToken = resolveClaimToken(body);
  if (!claimToken) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "claim_token is required"));
  }

  const mode = resolveMode(body);

  let createdAgentId: string | null = null;
  try {
    const session = await getConnectSessionByClaimToken({ claimToken, now: new Date() });
    if (!session || session.session_id !== String(sessionId)) {
      return jsonResponse(404, errorPayload("CONNECT_SESSION_NOT_FOUND", "Connect session not found"));
    }

    const earlyConflict = buildConflictFromStatus(session.status);
    if (earlyConflict) return earlyConflict;
    if (session.status !== "PENDING_CLAIM") {
      return jsonResponse(409, errorPayload("CONNECT_SESSION_NOT_CLAIMABLE", "Connect session cannot be claimed"));
    }

    if (ctx) {
      ctx.auditEvent = "connect.session_claimed";
      ctx.auditEntityType = "connect_session";
      ctx.auditEntityId = String(sessionId);
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
      const agentName = (agentNameRaw || String(session.requested_agent_name || "")).trim();
      if (!agentName) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_name is required"));
      }
      if (agentName.length > 80) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_name must be at most 80 characters"));
      }
      const ownerAgentLimit = getOwnerAgentLimit();
      const ownerAgents = await listOwnerAgentsForClaim({ ownerId: ctx.ownerId, limit: ownerAgentLimit });
      if (ownerAgents.length >= ownerAgentLimit) {
        return jsonResponse(
          409,
          errorPayload("OWNER_AGENT_LIMIT_REACHED", "Owner agent limit reached", { owner_agent_limit: ownerAgentLimit })
        );
      }

      const agent = await createAgent({
        ownerId: ctx.ownerId,
        name: agentName,
        metadata: {
          connect_client_type: session.client_type || null,
          connect_client_version: session.client_version || null,
          connect_session_id: String(sessionId)
        }
      });
      agentId = agent?.id ? String(agent.id) : null;
      createdAgentId = agentId;
      if (!agentId) {
        return jsonResponse(500, errorPayload("ERROR", "Failed to create agent"));
      }
    }

    const claimed = await claimConnectSession({
      sessionId: String(sessionId),
      claimToken,
      ownerId: ctx.ownerId,
      agentId,
      installationId: null,
      now: new Date()
    });

    let controlThreadId: string | null = null;
    try {
      const controlDm = await createOrGetControlDmThread({
        ownerId: ctx.ownerId,
        agentId
      });
      controlThreadId = controlDm?.thread?.thread_id ? String(controlDm.thread.thread_id) : null;
    } catch (controlDmError: any) {
      // Claim should remain successful even if control-DM provisioning is temporarily unavailable.
      console.error("control_dm.ensure_failed", {
        session_id: String(sessionId),
        owner_id: ctx.ownerId,
        agent_id: agentId,
        error: controlDmError?.message || String(controlDmError)
      });
    }

    if (ctx && controlThreadId) {
      ctx.security = {
        ...(ctx.security || {}),
        control_dm_thread_id: controlThreadId
      };
    }

    return jsonResponse(200, {
      data: {
        session_id: claimed.session_id,
        status: claimed.status,
        owner_id: claimed.owner_id,
        agent_id: claimed.agent_id,
        claimed_at: claimed.claimed_at || null
      }
    });
  } catch (error: any) {
    // Best-effort cleanup to avoid orphan agents when a claim loses the race.
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
  routeGroup: "connect.sessions.claim_owner",
  enableIdempotency: true
});
