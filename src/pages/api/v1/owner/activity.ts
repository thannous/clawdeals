import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getSupabaseServiceClient } from "../../../../server/db/supabase";
import { mapSupabaseError } from "../../../../server/services/supabase-errors";

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;
const MAX_AUDIT_SCAN = 500;
const LOOKBACK_DAYS = 7;

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function resolveLimit(rawLimit: any): { ok: true; value: number } | { ok: false; error: any } {
  if (rawLimit === null || rawLimit === undefined || rawLimit === "") {
    return { ok: true, value: DEFAULT_LIMIT };
  }
  const parsed = Number.parseInt(String(rawLimit), 10);
  if (Number.isNaN(parsed)) {
    return { ok: false, error: jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer")) };
  }
  if (parsed < 1 || parsed > MAX_LIMIT) {
    return {
      ok: false,
      error: jsonResponse(400, errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${MAX_LIMIT}`))
    };
  }
  return { ok: true, value: parsed };
}

function mapActivityRow(row: any) {
  return {
    activity_id: String(row.id),
    ts: row?.occurred_at ? String(row.occurred_at) : null,
    agent_id: row?.actor?.id ? String(row.actor.id) : null,
    action: row?.action?.event ? String(row.action.event) : row?.action?.path ? String(row.action.path) : "unknown",
    entity_type: row?.action?.entity_type ? String(row.action.entity_type) : null,
    entity_id: row?.action?.entity_id ? String(row.action.entity_id) : null,
    outcome: row?.outcome ? String(row.outcome) : null,
    request_id: row?.request_id ? String(row.request_id) : null
  };
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

  const limitResolved = resolveLimit(resolveParam(req.query?.limit));
  if ("error" in limitResolved) {
    return limitResolved.error;
  }
  const limit = limitResolved.value;

  const requestedAgentId = resolveParam(req.query?.agent_id);
  if (requestedAgentId && !isUuid(String(requestedAgentId))) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "agent_id must be a UUID"));
  }

  if (ctx) {
    ctx.auditEvent = "owner.activity_listed";
    ctx.auditEntityType = "owner";
    ctx.auditEntityId = ownerId;
  }

  try {
    const client = getSupabaseServiceClient();
    const { data: ownerAgentsData, error: ownerAgentsError } = await client
      .from("agents")
      .select("id")
      .eq("owner_id", ownerId)
      .limit(200);

    if (ownerAgentsError) {
      const mapped = mapSupabaseError(ownerAgentsError);
      return jsonResponse(mapped.status || 500, errorPayload(mapped.code || "ERROR", mapped.message));
    }

    const ownerAgentIds = new Set(
      (Array.isArray(ownerAgentsData) ? ownerAgentsData : [])
        .map((row: any) => String(row?.id || ""))
        .filter((value) => Boolean(value))
    );

    if (requestedAgentId && !ownerAgentIds.has(String(requestedAgentId))) {
      return jsonResponse(403, errorPayload("PERMISSION_DENIED", "Agent does not belong to owner"));
    }

    const allowedAgentIds = requestedAgentId ? new Set([String(requestedAgentId)]) : ownerAgentIds;

    if (allowedAgentIds.size === 0) {
      return jsonResponse(
        200,
        {
          data: {
            owner_id: ownerId,
            activities: []
          }
        },
        { "Cache-Control": "no-store" }
      );
    }

    const now = new Date();
    const from = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const to = now.toISOString();
    const scanLimit = Math.max(80, Math.min(MAX_AUDIT_SCAN, limit * 8));

    const { data: auditRows, error: auditError } = await client
      .from("audit_logs")
      .select("id,occurred_at,actor,action,outcome,request_id")
      .eq("actor->>type", "agent")
      .gte("occurred_at", from)
      .lt("occurred_at", to)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(scanLimit);

    if (auditError) {
      const mapped = mapSupabaseError(auditError);
      return jsonResponse(mapped.status || 500, errorPayload(mapped.code || "ERROR", mapped.message));
    }

    const activities = (Array.isArray(auditRows) ? auditRows : [])
      .filter((row: any) => {
        const actorId = row?.actor?.id ? String(row.actor.id) : "";
        return allowedAgentIds.has(actorId);
      })
      .slice(0, limit)
      .map(mapActivityRow);

    return jsonResponse(
      200,
      {
        data: {
          owner_id: ownerId,
          activities
        }
      },
      { "Cache-Control": "no-store" }
    );
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "owner.activity.read",
  enableIdempotency: false
});
