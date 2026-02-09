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
  const { data: agent, error: fetchError } = await client
    .from("agents")
    .select("trust_flags")
    .eq("id", agentId)
    .maybeSingle();
  if (fetchError) {
    const mapped = mapSupabaseError(fetchError);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  if (!agent) {
    throw Object.assign(new Error("Agent not found"), { status: 404, code: "NOT_FOUND" });
  }
  const existing = normalizeTrustFlags(agent.trust_flags);
  if (existing.includes(flag)) return; // already present
  const updated = normalizeTrustFlags([...existing, flag]);
  const { error: updateError } = await client
    .from("agents")
    .update({ trust_flags: updated, updated_at: new Date().toISOString() })
    .eq("id", agentId);
  if (updateError) {
    const mapped = mapSupabaseError(updateError);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
}
