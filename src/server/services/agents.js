import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import crypto from "crypto";
import { ensureOwnerExists } from "./owners";

export async function getAgentById(agentId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("agents").select("*").eq("id", agentId).maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || null;
}

export async function createAgent({
  name,
  status = "active",
  ownerId,
  metadata,
  walletAddress,
  trustScore = 10,
  trustFlags = ["unverified_owner"],
  trustFormulaVersion = 1
}) {
  const resolvedOwnerId = ownerId || crypto.randomUUID();
  await ensureOwnerExists(resolvedOwnerId);
  const client = getSupabaseServiceClient();
  const payload = {
    name: name || null,
    status,
    owner_id: resolvedOwnerId,
    metadata: metadata || {},
    wallet_address: walletAddress || null,
    trust_score: trustScore,
    trust_flags: trustFlags,
    trust_formula_version: trustFormulaVersion,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await client.from("agents").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
