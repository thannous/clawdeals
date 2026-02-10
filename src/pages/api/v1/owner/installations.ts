import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import {
  listInstallationsForOwner,
  INSTALLATIONS_DEFAULT_LIMIT,
  INSTALLATIONS_MAX_LIMIT
} from "../../../../server/services/agent-installations";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (ctx?.actor?.type !== "owner") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const ownerId = ctx?.ownerId || null;
  if (!ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }

  const rawLimit = resolveParam(req.query?.limit);
  let limit = INSTALLATIONS_DEFAULT_LIMIT;
  if (rawLimit !== null && rawLimit !== undefined && rawLimit !== "") {
    const parsed = Number.parseInt(String(rawLimit), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > INSTALLATIONS_MAX_LIMIT) {
      return jsonResponse(
        400,
        errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${INSTALLATIONS_MAX_LIMIT}`)
      );
    }
    limit = parsed;
  }

  if (ctx) {
    ctx.auditEvent = "installation.list_viewed";
    ctx.auditEntityType = "owner";
    ctx.auditEntityId = ownerId;
  }

  try {
    const rows = await listInstallationsForOwner({ ownerId, limit });
    const installations = (rows || []).map((row: any) => ({
      installation_id: row.installation_id,
      agent_id: row.agent_id,
      client_type: row.client_type,
      client_version: row.client_version ?? null,
      status: row.status,
      created_at: row.created_at,
      last_seen_at: row.last_seen_at ?? null
    }));
    return jsonResponse(200, { installations });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "installations.read",
  enableIdempotency: false
});

