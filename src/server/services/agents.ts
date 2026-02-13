import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import crypto from "crypto";
import { ensureOwnerExists } from "./owners";
import {
  computeBaseTrustFlags,
  normalizeTrustFlags,
  TRUST_BASE_SCORE,
  TRUST_FORMULA_VERSION
} from "../trustscore/compute";

export async function getAgentById(agentId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("agents").select("*").eq("id", agentId).maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || null;
}

export async function deleteAgentById(agentId: string) {
  if (!agentId) return;
  const client = getSupabaseServiceClient();
  const { error } = await client.from("agents").delete().eq("id", agentId);
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
}

export async function getAgentIdByOwnerId(ownerId: string): Promise<string | null> {
  if (!ownerId) return null;
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("agents").select("id").eq("owner_id", ownerId).limit(1).maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  const id = data?.id ? String(data.id) : null;
  return id || null;
}

export function getOwnerAgentLimit(): number {
  const raw = process.env.OWNER_AGENT_LIMIT;
  if (!raw) return 1;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

type OwnerClaimAgentRow = {
  id: string;
  name: string | null;
  status: string | null;
  created_at: string;
};

export async function listOwnerAgentsForClaim({
  ownerId,
  limit = 10
}: {
  ownerId?: string | null;
  limit?: number;
} = {}): Promise<OwnerClaimAgentRow[]> {
  if (!ownerId) return [];
  const pageLimit = Math.max(1, Math.min(200, Number.isInteger(limit) ? Number(limit) : 10));
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("agents")
    .select("id,name,status,created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(pageLimit);
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row: any) => ({
    id: String(row.id),
    name: row?.name ? String(row.name) : null,
    status: row?.status ? String(row.status) : null,
    created_at: row?.created_at ? String(row.created_at) : ""
  }));
}

type CreateAgentInput = {
  name?: string | null;
  status?: string;
  ownerId?: string | null;
  metadata?: Record<string, unknown> | null;
  walletAddress?: string | null;
  trustScore?: number | null;
  trustFlags?: string[] | null;
  trustFormulaVersion?: number | null;
};

type CreateAgentWithOwnerLimitInput = CreateAgentInput & {
  ownerId: string;
  ownerAgentLimit: number;
};

export async function createAgent({
  name,
  status = "active",
  ownerId,
  metadata,
  walletAddress,
  trustScore,
  trustFlags,
  trustFormulaVersion
}: CreateAgentInput = {}) {
  const resolvedOwnerId = ownerId || crypto.randomUUID();
  const owner = await ensureOwnerExists(resolvedOwnerId);
  const emailVerified = Boolean(owner?.email_verified_at);
  const phoneVerified = Boolean(owner?.phone_verified_at);
  const baseFlags = computeBaseTrustFlags({
    daysSinceCreated: 0,
    emailVerified,
    phoneVerified
  });
  const resolvedTrustFlags = normalizeTrustFlags(trustFlags ?? baseFlags);
  const resolvedTrustScore = trustScore ?? TRUST_BASE_SCORE;
  const resolvedFormulaVersion = trustFormulaVersion ?? TRUST_FORMULA_VERSION;
  const nowIso = new Date().toISOString();
  const client = getSupabaseServiceClient();
  const payload = {
    name: name || null,
    status,
    owner_id: resolvedOwnerId,
    metadata: metadata || {},
    wallet_address: walletAddress || null,
    trust_score: resolvedTrustScore,
    trust_flags: resolvedTrustFlags,
    trust_formula_version: resolvedFormulaVersion,
    trust_updated_at: nowIso,
    updated_at: nowIso
  };

  const { data, error } = await client.from("agents").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}

export async function createAgentWithOwnerLimit({
  name,
  status = "active",
  ownerId,
  ownerAgentLimit,
  metadata,
  walletAddress,
  trustScore,
  trustFlags,
  trustFormulaVersion
}: CreateAgentWithOwnerLimitInput) {
  const resolvedLimit = Math.max(1, Number.isFinite(ownerAgentLimit) ? Math.trunc(ownerAgentLimit) : 1);
  const owner = await ensureOwnerExists(ownerId);
  const emailVerified = Boolean(owner?.email_verified_at);
  const phoneVerified = Boolean(owner?.phone_verified_at);
  const baseFlags = computeBaseTrustFlags({
    daysSinceCreated: 0,
    emailVerified,
    phoneVerified
  });
  const resolvedTrustFlags = normalizeTrustFlags(trustFlags ?? baseFlags);
  const resolvedTrustScore = trustScore ?? TRUST_BASE_SCORE;
  const resolvedFormulaVersion = trustFormulaVersion ?? TRUST_FORMULA_VERSION;

  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("create_agent_with_owner_limit_v1", {
    p_owner_id: ownerId,
    p_name: name || null,
    p_status: status || "active",
    p_metadata: metadata || {},
    p_wallet_address: walletAddress || null,
    p_trust_score: resolvedTrustScore,
    p_trust_flags: resolvedTrustFlags,
    p_trust_formula_version: resolvedFormulaVersion,
    p_owner_agent_limit: resolvedLimit
  });

  if (error) {
    const message = String(error?.message || "");
    if (/^VALIDATION_ERROR:/i.test(message)) {
      throw Object.assign(new Error("Validation failed"), { status: 400, code: "VALIDATION_ERROR" });
    }
    if (/^INVALID_REFERENCE:/i.test(message)) {
      throw Object.assign(new Error("Invalid reference"), { status: 400, code: "INVALID_REFERENCE" });
    }
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }

  if (!data?.id) {
    throw Object.assign(new Error("Owner agent limit reached"), {
      status: 409,
      code: "OWNER_AGENT_LIMIT_REACHED",
      details: { owner_agent_limit: resolvedLimit }
    });
  }

  return data;
}

export async function updateAgentName(agentId: string, name: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("agents")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", agentId)
    .select("id,name")
    .single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}

export async function claimUnownedAgentToOwner({
  agentId,
  ownerId
}: {
  agentId: string;
  ownerId: string;
}) {
  const client = getSupabaseServiceClient();
  const { data: existing, error: existingError } = await client
    .from("agents")
    .select("id,owner_id,name")
    .eq("id", agentId)
    .maybeSingle();
  if (existingError) {
    const mapped = mapSupabaseError(existingError);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  if (!existing?.id) {
    throw Object.assign(new Error("Agent not found"), { status: 404, code: "NOT_FOUND" });
  }

  const currentOwnerId = existing.owner_id ? String(existing.owner_id) : null;
  if (currentOwnerId && currentOwnerId !== ownerId) {
    const { data: currentOwner, error: ownerError } = await client
      .from("owners")
      .select("owner_id,email,phone_e164,email_verified_at,phone_verified_at")
      .eq("owner_id", currentOwnerId)
      .maybeSingle();
    if (ownerError) {
      const mapped = mapSupabaseError(ownerError);
      throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
    }

    const hasOwnerIdentityData = Boolean(
      currentOwner?.email ||
        currentOwner?.phone_e164 ||
        currentOwner?.email_verified_at ||
        currentOwner?.phone_verified_at
    );

    let hasOwnerAuthLink = false;
    let hasOwnerSession = false;
    if (!hasOwnerIdentityData) {
      const [{ count: linkCount, error: linksError }, { count: sessionCount, error: sessionsError }] = await Promise.all(
        [
          client
            .from("owner_auth_links")
            .select("link_id", { count: "exact", head: true })
            .eq("owner_id", currentOwnerId),
          client
            .from("owner_sessions")
            .select("session_id", { count: "exact", head: true })
            .eq("owner_id", currentOwnerId)
        ]
      );
      if (linksError) {
        const mapped = mapSupabaseError(linksError);
        throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
      }
      if (sessionsError) {
        const mapped = mapSupabaseError(sessionsError);
        throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
      }
      hasOwnerAuthLink = Number(linkCount || 0) > 0;
      hasOwnerSession = Number(sessionCount || 0) > 0;
    }

    const canTransferPlaceholderOwner = !hasOwnerIdentityData && !hasOwnerAuthLink && !hasOwnerSession;
    if (!canTransferPlaceholderOwner) {
      throw Object.assign(new Error("Agent already linked to another owner"), {
        status: 409,
        code: "AGENT_ALREADY_CLAIMED"
      });
    }
  }
  if (currentOwnerId === ownerId) {
    return {
      agent_id: String(existing.id),
      owner_id: ownerId,
      name: existing.name ? String(existing.name) : null,
      claimed: false
    };
  }

  let updateQuery = client
    .from("agents")
    .update({ owner_id: ownerId, updated_at: new Date().toISOString() })
    .eq("id", agentId);
  if (currentOwnerId) {
    updateQuery = updateQuery.eq("owner_id", currentOwnerId);
  } else {
    updateQuery = updateQuery.is("owner_id", null);
  }
  const { data: updated, error: updateError } = await updateQuery.select("id,owner_id,name").maybeSingle();
  if (updateError) {
    const mapped = mapSupabaseError(updateError);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }

  // Lost update race: re-read and resolve deterministically.
  if (!updated?.id) {
    const { data: reread, error: rereadError } = await client
      .from("agents")
      .select("id,owner_id,name")
      .eq("id", agentId)
      .maybeSingle();
    if (rereadError) {
      const mapped = mapSupabaseError(rereadError);
      throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
    }
    const rereadOwnerId = reread?.owner_id ? String(reread.owner_id) : null;
    if (!reread?.id) {
      throw Object.assign(new Error("Agent not found"), { status: 404, code: "NOT_FOUND" });
    }
    if (rereadOwnerId && rereadOwnerId !== ownerId) {
      throw Object.assign(new Error("Agent already linked to another owner"), {
        status: 409,
        code: "AGENT_ALREADY_CLAIMED"
      });
    }
    return {
      agent_id: String(reread.id),
      owner_id: ownerId,
      name: reread.name ? String(reread.name) : null,
      claimed: rereadOwnerId === ownerId ? false : true
    };
  }

  return {
    agent_id: String(updated.id),
    owner_id: updated.owner_id ? String(updated.owner_id) : ownerId,
    name: updated.name ? String(updated.name) : null,
    claimed: true
  };
}

export async function addAgentTrustFlag(agentId: string, flag: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.rpc("add_agent_trust_flag_v1", {
    p_agent_id: agentId,
    p_flag: flag
  });
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  if (data === null || data === undefined) {
    throw Object.assign(new Error("Agent not found"), { status: 404, code: "NOT_FOUND" });
  }
}
