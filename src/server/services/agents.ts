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
