import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getSupabaseServiceClient } from "../../../../server/db/supabase";
import { mapSupabaseError } from "../../../../server/services/supabase-errors";
import { getChannelIdentity, denyPairing, revokePairing } from "../../../../server/services/channel-identities";
import { resolveApproval } from "../../../../server/services/approvals";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function mapChannelState(dbState: string) {
  const st = String(dbState || "").toUpperCase();
  if (st === "ACTIVE") return "PAIRED";
  if (st === "PENDING") return "PENDING_APPROVAL";
  if (st === "REVOKED") return "REVOKED";
  return "UNKNOWN";
}

function toApiChannel(row: any) {
  return {
    channel_account_id: row.channel_identity_id,
    channel_type: row.channel_type,
    display_name: row.display_name ?? null,
    role: row.role ?? null,
    state: mapChannelState(row.state),
    created_at: row.created_at ?? null,
    paired_at: row.approved_at ?? null,
    revoked_at: row.revoked_at ?? null,
    last_seen_at: row.last_seen_at ?? null
  };
}

async function findPendingPairApproval({ ownerId, channelIdentityId }: any) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("approvals")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("action_type", "channel.pair")
    .eq("action_ref_id", channelIdentityId)
    .eq("state", "PENDING")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || null;
}

export async function handler(req, res, ctx) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
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

  const idAction = String(resolveParam(req.query?.id_action ?? req.query?.id) || "");
  const [channelAccountId, action] = idAction.split(":");
  if (!channelAccountId || !action) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }
  if (!isUuid(channelAccountId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "channel_account_id must be a UUID"));
  }
  if (action !== "revoke") {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }

  if (ctx) ctx.auditEvent = "channel.revoked";

  try {
    const existing: any = await getChannelIdentity({ ownerId, channelIdentityId: channelAccountId });
    if (!existing) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Channel not found"));
    }

    if (existing.state === "REVOKED") {
      return jsonResponse(200, { data: { channel: toApiChannel(existing) } });
    }

    if (existing.state === "ACTIVE") {
      const updated = await revokePairing({
        ownerId,
        channelIdentityId: channelAccountId,
        revokedBy: ownerId
      });
      return jsonResponse(200, { data: { channel: toApiChannel(updated) } });
    }

    // PENDING: prefer resolving the approval so the queue stays consistent.
    const approval = await findPendingPairApproval({ ownerId, channelIdentityId: channelAccountId });
    if (approval) {
      await resolveApproval({
        approvalId: approval.approval_id,
        ownerId,
        decision: "DENIED",
        resolvedBy: ownerId,
        reason: "revoked"
      });
      const updated = await getChannelIdentity({ ownerId, channelIdentityId: channelAccountId });
      return jsonResponse(200, { data: { channel: toApiChannel(updated) } });
    }

    const updated = await denyPairing({
      ownerId,
      channelIdentityId: channelAccountId,
      deniedBy: ownerId
    });
    return jsonResponse(200, { data: { channel: toApiChannel(updated) } });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, { routeGroup: "channels.pairings.write" });
