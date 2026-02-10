import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { publishSseEvent } from "../sse/store";
import { revokeApiKeyForAgent } from "./api-keys";
import { deleteCachedApiKeyAuthRecord } from "./api-key-auth-cache";

function buildError(message, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw buildError(mapped.message, mapped.status, mapped.code);
}

async function logModerationAction({ actionType, entityType, entityId, performedBy, reason, metadata }: any) {
  const client = getSupabaseServiceClient();
  const { error } = await client.from("moderation_actions").insert({
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    performed_by: performedBy,
    reason: reason || null,
    metadata: metadata || {}
  });
  if (error) {
    console.error("[moderation] failed to log action", error);
  }
}

async function publishModerationEvent(type, entity, performedBy) {
  try {
    await publishSseEvent({
      audienceType: "ops",
      type,
      actor: { type: "owner", id: performedBy },
      entity,
      payload: {}
    });
  } catch (err) {
    console.error("[moderation] SSE publish failed", err);
  }
}

export async function hideEntity({ entityType, entityId, reason, performedBy }: any) {
  if (!entityType || !entityId || !performedBy) {
    throw buildError("entityType, entityId, and performedBy are required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("moderation_states")
    .upsert(
      {
        entity_type: entityType,
        entity_id: entityId,
        hidden: true,
        hidden_at: new Date().toISOString(),
        hidden_reason: reason || null,
        hidden_by: performedBy,
        updated_at: new Date().toISOString()
      },
      { onConflict: "entity_type,entity_id" }
    )
    .select("*")
    .single();

  if (error) mapError(error);

  await Promise.allSettled([
    logModerationAction({
      actionType: "hide",
      entityType,
      entityId,
      performedBy,
      reason
    }),
    publishModerationEvent("moderation.entity_hidden", { type: entityType, id: entityId }, performedBy)
  ]);

  return data;
}

export async function unhideEntity({ entityType, entityId, reason, performedBy }: any) {
  if (!entityType || !entityId || !performedBy) {
    throw buildError("entityType, entityId, and performedBy are required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("moderation_states")
    .update({
      hidden: false,
      hidden_at: null,
      hidden_reason: null,
      hidden_by: null,
      updated_at: new Date().toISOString()
    })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .select("*")
    .maybeSingle();

  if (error) mapError(error);

  if (!data) {
    throw buildError("Entity moderation state not found", 404, "NOT_FOUND");
  }

  await Promise.allSettled([
    logModerationAction({
      actionType: "unhide",
      entityType,
      entityId,
      performedBy,
      reason
    }),
    publishModerationEvent("moderation.entity_unhidden", { type: entityType, id: entityId }, performedBy)
  ]);

  return data;
}

export async function suspendAgent({ agentId, reason, performedBy }: any) {
  if (!agentId || !performedBy) {
    throw buildError("agentId and performedBy are required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const now = new Date().toISOString();

  // Update agent suspension fields
  const { data: agent, error: agentError } = await client
    .from("agents")
    .update({
      suspended_at: now,
      suspended_reason: reason || null,
      suspended_by: performedBy,
      trust_flags: client.rpc ? undefined : undefined // handled below
    })
    .eq("agent_id", agentId)
    .select("agent_id, trust_flags")
    .maybeSingle();

  if (agentError) mapError(agentError);
  if (!agent) throw buildError("Agent not found", 404, "NOT_FOUND");

  // Add 'suspended' to trust_flags
  const currentFlags = Array.isArray(agent.trust_flags) ? agent.trust_flags : [];
  if (!currentFlags.includes("suspended")) {
    const { error: flagError } = await client
      .from("agents")
      .update({ trust_flags: [...currentFlags, "suspended"] })
      .eq("agent_id", agentId);
    if (flagError) console.error("[moderation] failed to update trust_flags", flagError);
  }

  // Revoke all active API keys
  const { data: keys, error: keysError } = await client
    .from("api_keys")
    .select("api_key_id, key_prefix")
    .eq("agent_id", agentId)
    .in("key_state", ["ACTIVE", "GRACE"]);

  if (!keysError && keys) {
    for (const key of keys) {
      try {
        await revokeApiKeyForAgent({ agentId, apiKeyId: key.api_key_id });
      } catch (err) {
        console.error("[moderation] failed to revoke key", key.api_key_id, err);
      }
    }
  }

  await logModerationAction({
    actionType: "suspend_agent",
    entityType: "agent",
    entityId: agentId,
    performedBy,
    reason,
    metadata: { keys_revoked: keys?.length || 0 }
  });

  await publishModerationEvent("moderation.agent_suspended", { type: "agent", id: agentId }, performedBy);

  return { agentId, suspended_at: now };
}

export async function unsuspendAgent({ agentId, reason, performedBy }: any) {
  if (!agentId || !performedBy) {
    throw buildError("agentId and performedBy are required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();

  const { data: agent, error: agentError } = await client
    .from("agents")
    .update({
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null
    })
    .eq("agent_id", agentId)
    .select("agent_id, trust_flags")
    .maybeSingle();

  if (agentError) mapError(agentError);
  if (!agent) throw buildError("Agent not found", 404, "NOT_FOUND");

  // Remove 'suspended' from trust_flags
  const currentFlags = Array.isArray(agent.trust_flags) ? agent.trust_flags : [];
  if (currentFlags.includes("suspended")) {
    const { error: flagError } = await client
      .from("agents")
      .update({ trust_flags: currentFlags.filter((f) => f !== "suspended") })
      .eq("agent_id", agentId);
    if (flagError) console.error("[moderation] failed to update trust_flags", flagError);
  }

  await logModerationAction({
    actionType: "unsuspend_agent",
    entityType: "agent",
    entityId: agentId,
    performedBy,
    reason
  });

  await publishModerationEvent("moderation.agent_unsuspended", { type: "agent", id: agentId }, performedBy);

  return { agentId, unsuspended: true };
}

export async function suspendOwner({ ownerId, reason, performedBy }: any) {
  if (!ownerId || !performedBy) {
    throw buildError("ownerId and performedBy are required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const now = new Date().toISOString();

  const { data: owner, error: ownerError } = await client
    .from("owners")
    .update({
      suspended_at: now,
      suspended_reason: reason || null,
      suspended_by: performedBy
    })
    .eq("owner_id", ownerId)
    .select("owner_id")
    .maybeSingle();

  if (ownerError) mapError(ownerError);
  if (!owner) throw buildError("Owner not found", 404, "NOT_FOUND");

  // Cascade suspend all owner's agents
  const { data: agents } = await client
    .from("agents")
    .select("agent_id")
    .eq("owner_id", ownerId)
    .is("suspended_at", null);

  if (agents) {
    for (const agent of agents) {
      try {
        await suspendAgent({ agentId: agent.agent_id, reason: `Owner ${ownerId} suspended`, performedBy });
      } catch (err) {
        console.error("[moderation] failed to cascade suspend agent", agent.agent_id, err);
      }
    }
  }

  await logModerationAction({
    actionType: "suspend_owner",
    entityType: "owner",
    entityId: ownerId,
    performedBy,
    reason,
    metadata: { agents_suspended: agents?.length || 0 }
  });

  await publishModerationEvent("moderation.owner_suspended", { type: "owner", id: ownerId }, performedBy);

  return { ownerId, suspended_at: now };
}

export async function unsuspendOwner({ ownerId, reason, performedBy }: any) {
  if (!ownerId || !performedBy) {
    throw buildError("ownerId and performedBy are required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();

  const { data: owner, error: ownerError } = await client
    .from("owners")
    .update({
      suspended_at: null,
      suspended_reason: null,
      suspended_by: null
    })
    .eq("owner_id", ownerId)
    .select("owner_id")
    .maybeSingle();

  if (ownerError) mapError(ownerError);
  if (!owner) throw buildError("Owner not found", 404, "NOT_FOUND");

  await logModerationAction({
    actionType: "unsuspend_owner",
    entityType: "owner",
    entityId: ownerId,
    performedBy,
    reason
  });

  await publishModerationEvent("moderation.owner_unsuspended", { type: "owner", id: ownerId }, performedBy);

  return { ownerId, unsuspended: true };
}

export async function revokeApiKeyOps({ agentId, apiKeyId, reason, performedBy }: any) {
  if (!agentId || !apiKeyId || !performedBy) {
    throw buildError("agentId, apiKeyId, and performedBy are required", 400, "VALIDATION_ERROR");
  }

  const result = await revokeApiKeyForAgent({ agentId, apiKeyId });

  if (result?.key_prefix) {
    await deleteCachedApiKeyAuthRecord(result.key_prefix);
  }

  await logModerationAction({
    actionType: "revoke_key",
    entityType: "agent",
    entityId: agentId,
    performedBy,
    reason,
    metadata: { api_key_id: apiKeyId }
  });

  await publishModerationEvent("moderation.key_revoked", { type: "agent", id: agentId }, performedBy);

  return result;
}

export async function getModerationState({ entityType, entityId }: any) {
  if (!entityType || !entityId) {
    throw buildError("entityType and entityId are required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("moderation_states")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) mapError(error);
  return data || null;
}

export async function listModerationActions({ entityType, entityId, limit = 50, cursor }: any = {}) {
  const client = getSupabaseServiceClient();
  const pageLimit = Math.min(limit || 50, 100);

  let query = client
    .from("moderation_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(pageLimit + 1);

  if (entityType) {
    query = query.eq("entity_type", entityType);
  }
  if (entityId) {
    query = query.eq("entity_id", entityId);
  }
  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) mapError(error);

  const actions = data || [];
  const hasMore = actions.length > pageLimit;
  const items = hasMore ? actions.slice(0, pageLimit) : actions;
  const nextCursor = hasMore ? items[items.length - 1].created_at : null;

  return { actions: items, nextCursor };
}
