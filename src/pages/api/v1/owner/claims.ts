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

function toIsoOrNull(value: any) {
  if (!value) return null;
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString();
}

function sortByCreatedDesc(a: any, b: any) {
  const aMs = Date.parse(String(a?.created_at || "")) || 0;
  const bMs = Date.parse(String(b?.created_at || "")) || 0;
  return bMs - aMs;
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
    ctx.auditEvent = "owner.claims_listed";
    ctx.auditEntityType = "owner";
    ctx.auditEntityId = ownerId;
  }

  try {
    const client = getSupabaseServiceClient();
    const [connectResp, deviceResp] = await Promise.all([
      client
        .from("connect_sessions")
        .select(
          "session_id,status,requested_agent_name,requested_scopes,agent_id,created_at,claimed_at,cancelled_at,expired_at,delivered_at"
        )
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(limit),
      client
        .from("oauth_device_authorizations")
        .select(
          "authorization_id,status,requested_agent_name,requested_scopes,agent_id,created_at,authorized_at,denied_at,expired_at"
        )
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(limit)
    ]);

    if (connectResp.error) {
      const mapped = mapSupabaseError(connectResp.error);
      return jsonResponse(mapped.status || 500, errorPayload(mapped.code || "ERROR", mapped.message));
    }
    if (deviceResp.error) {
      const mapped = mapSupabaseError(deviceResp.error);
      return jsonResponse(mapped.status || 500, errorPayload(mapped.code || "ERROR", mapped.message));
    }

    const connectClaims = (Array.isArray(connectResp.data) ? connectResp.data : []).map((row: any) => ({
      claim_id: String(row.session_id),
      source: "connect_link",
      status: row?.status ? String(row.status) : null,
      requested_agent_name: row?.requested_agent_name ? String(row.requested_agent_name) : null,
      requested_scopes: Array.isArray(row?.requested_scopes) ? row.requested_scopes : [],
      agent_id: row?.agent_id ? String(row.agent_id) : null,
      created_at: toIsoOrNull(row?.created_at),
      decided_at: toIsoOrNull(row?.claimed_at || row?.cancelled_at || row?.expired_at || row?.delivered_at)
    }));

    const deviceClaims = (Array.isArray(deviceResp.data) ? deviceResp.data : []).map((row: any) => ({
      claim_id: String(row.authorization_id),
      source: "device_code",
      status: row?.status ? String(row.status) : null,
      requested_agent_name: row?.requested_agent_name ? String(row.requested_agent_name) : null,
      requested_scopes: Array.isArray(row?.requested_scopes) ? row.requested_scopes : [],
      agent_id: row?.agent_id ? String(row.agent_id) : null,
      created_at: toIsoOrNull(row?.created_at),
      decided_at: toIsoOrNull(row?.authorized_at || row?.denied_at || row?.expired_at)
    }));

    const claims = connectClaims.concat(deviceClaims).sort(sortByCreatedDesc).slice(0, limit);

    return jsonResponse(
      200,
      {
        data: {
          owner_id: ownerId,
          claims
        }
      },
      { "Cache-Control": "no-store" }
    );
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "owner.claims.read",
  enableIdempotency: false
});
