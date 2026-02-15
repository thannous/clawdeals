import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getSupabaseServiceClient } from "../../../../server/db/supabase";
import { encodeThreadsCursor, decodeThreadsCursor } from "../../../../server/services/threads-cursor";
import { mapSupabaseError } from "../../../../server/services/supabase-errors";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

const VALID_STATUSES = new Set(["OPEN", "CLOSED"]);

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const actorType = ctx?.actor?.type;
  if (actorType !== "owner" && actorType !== "agent") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const ownerId = ctx?.ownerId || null;
  if (!ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }

  const rawStatus = resolveParam(req.query?.status);
  const status = rawStatus ? String(rawStatus).toUpperCase() : null;
  if (status && !VALID_STATUSES.has(status)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "status is invalid"));
  }

  let limit = 50;
  const rawLimit = resolveParam(req.query?.limit);
  if (rawLimit !== null && rawLimit !== "") {
    const parsed = Number.parseInt(String(rawLimit), 10);
    if (Number.isNaN(parsed)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be an integer"));
    }
    if (parsed < 1 || parsed > 100) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "limit must be between 1 and 100"));
    }
    limit = parsed;
  }

  const rawCursor = resolveParam(req.query?.cursor);
  let cursor = null;
  if (rawCursor) {
    const parsed = decodeThreadsCursor(rawCursor);
    if (parsed?.error) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
    }
    cursor = parsed?.value || parsed || null;
  }

  if (ctx) {
    ctx.auditEvent = "owner.threads_listed";
    ctx.auditEntityType = "owner";
    ctx.auditEntityId = ownerId;
  }

  try {
    const client = getSupabaseServiceClient();
    const { data: agents, error: agentsError } = await client
      .from("agents")
      .select("id")
      .eq("owner_id", ownerId);

    if (agentsError) {
      const mapped = mapSupabaseError(agentsError);
      return jsonResponse(mapped.status || 500, errorPayload(mapped.code || "ERROR", mapped.message));
    }

    const agentIds = (agents || []).map((a: any) => a.id);
    if (agentIds.length === 0) {
      return jsonResponse(200, {
        data: {
          threads: [],
          next_cursor: null
        }
      }, { "Cache-Control": "no-store" });
    }

    const cappedLimit = Math.max(1, Math.min(100, limit));
    const fetchLimit = cappedLimit + 1;

    const agentIdList = agentIds.map((id: string) => `"${id}"`).join(",");
    let query = client
      .from("threads")
      .select("*")
      .eq("thread_type", "MARKETPLACE")
      .or(`buyer_agent_id.in.(${agentIdList}),seller_agent_id.in.(${agentIdList})`)
      .order("created_at", { ascending: false })
      .order("thread_id", { ascending: false })
      .limit(fetchLimit);

    if (status) {
      query = query.eq("status", status);
    }

    if (cursor?.created_at && cursor?.thread_id) {
      const createdAt = `"${cursor.created_at}"`;
      const threadId = `"${cursor.thread_id}"`;
      query = query.or(
        `created_at.lt.${createdAt},and(created_at.eq.${createdAt},thread_id.lt.${threadId})`
      );
    }

    const { data, error } = await query;
    if (error) {
      const mapped = mapSupabaseError(error);
      return jsonResponse(mapped.status || 500, errorPayload(mapped.code || "ERROR", mapped.message));
    }

    const rows = data || [];
    const hasMore = rows.length > cappedLimit;
    const items = hasMore ? rows.slice(0, cappedLimit) : rows;

    const nextCursor = hasMore && items.length > 0
      ? encodeThreadsCursor({
          created_at: items[items.length - 1].created_at,
          thread_id: items[items.length - 1].thread_id
        })
      : null;

    return jsonResponse(200, {
      data: {
        threads: items,
        next_cursor: nextCursor
      }
    }, { "Cache-Control": "no-store" });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "owner.threads.read",
  enableIdempotency: false
});
