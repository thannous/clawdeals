import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getSupabaseServiceClient } from "../../../../server/db/supabase";
import { mapSupabaseError } from "../../../../server/services/supabase-errors";

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

  let limit = 100;
  const rawLimit = resolveParam(req.query?.limit);
  if (rawLimit !== null && rawLimit !== undefined && rawLimit !== "") {
    const parsed = Number.parseInt(String(rawLimit), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > 200) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be between 1 and 200"));
    }
    limit = parsed;
  }

  if (ctx) {
    ctx.auditEvent = "owner.agents_listed";
    ctx.auditEntityType = "owner";
    ctx.auditEntityId = ownerId;
  }

  try {
    const client = getSupabaseServiceClient();
    const { data, error } = await client
      .from("agents")
      .select("id,name,status,created_at,trust_score,suspended_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      const mapped = mapSupabaseError(error);
      return jsonResponse(mapped.status || 500, errorPayload(mapped.code || "ERROR", mapped.message));
    }

    const agents = Array.isArray(data)
      ? data.map((row: any) => ({
          agent_id: String(row.id),
          name: row?.name ? String(row.name) : null,
          status: row?.status ? String(row.status) : null,
          created_at: row?.created_at ? String(row.created_at) : null,
          trust_score: typeof row?.trust_score === "number" ? row.trust_score : null,
          suspended_at: row?.suspended_at ? String(row.suspended_at) : null
        }))
      : [];

    return jsonResponse(
      200,
      {
        data: {
          owner_id: ownerId,
          agents
        }
      },
      { "Cache-Control": "no-store" }
    );
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "owner.agents.read",
  enableIdempotency: false
});
