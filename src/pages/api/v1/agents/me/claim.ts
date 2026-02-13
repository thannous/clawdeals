import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { readOwnerSessionCookie } from "../../../../../server/auth/session-cookie";
import { getOwnerSessionByTokenHash } from "../../../../../server/services/owner-sessions";
import { getOwner } from "../../../../../server/services/owners";
import { hashOwnerSessionToken, isOwnerSessionToken } from "../../../../../server/utils/session-tokens";
import { claimUnownedAgentToOwner } from "../../../../../server/services/agents";

async function resolveOwnerSessionOwnerId(req: any) {
  const sessionToken = readOwnerSessionCookie(req);
  if (!sessionToken || !isOwnerSessionToken(sessionToken)) {
    return null;
  }
  const tokenHash = hashOwnerSessionToken(sessionToken);
  const session = await getOwnerSessionByTokenHash(tokenHash);
  if (!session?.owner_id || session.status !== "ACTIVE") {
    return null;
  }
  const expiresAt = session.expires_at ? new Date(session.expires_at) : null;
  const expired = !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now();
  if (expired) {
    return null;
  }
  const owner = await getOwner(session.owner_id);
  if (!owner || owner.suspended_at) {
    return null;
  }
  return String(owner.owner_id);
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId || !ctx?.apiKeyId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "API key authentication required"));
  }

  const ownerId = await resolveOwnerSessionOwnerId(req);
  if (!ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner session required"));
  }

  try {
    const claimed = await claimUnownedAgentToOwner({
      agentId: String(ctx.agentId),
      ownerId
    });
    if (ctx) {
      ctx.auditEvent = claimed.claimed ? "agent.claimed_by_owner" : "agent.claimed_by_owner_noop";
      ctx.auditEntityType = "agent";
      ctx.auditEntityId = String(ctx.agentId);
    }

    return jsonResponse(200, {
      data: claimed
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "agents.me.claim_owner",
  enableIdempotency: false
});
