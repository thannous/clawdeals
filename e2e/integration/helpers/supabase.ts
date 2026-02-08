import { createClient } from "@supabase/supabase-js";

import { randomId } from "./ids";
import { generateApiKey, hashApiKeySecret } from "../../../src/server/utils/api-keys";

export function createSupabaseAdmin() {
  return createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false }
  });
}

export async function ensureStorageBucket(
  supabase: any,
  bucketName: string,
  options: { public?: boolean; fileSizeLimit?: number; allowedMimeTypes?: string[] } = {}
) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  const exists = (buckets || []).some((bucket: any) => bucket.name === bucketName);
  if (exists) return;

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: options.public ?? false,
    fileSizeLimit: options.fileSizeLimit,
    allowedMimeTypes: options.allowedMimeTypes
  });
  if (createError && !/already exists/i.test(createError.message || "")) {
    throw createError;
  }
}

export async function ensureOwnerDb(supabase: any, ownerId: string) {
  await supabase.from("owners").upsert({
    owner_id: ownerId,
    updated_at: new Date().toISOString()
  });
}

export async function createAgentDb(supabase: any, ownerId: string) {
  return createAgentDbWithOverrides(supabase, ownerId, {});
}

export async function createAgentDbWithOverrides(
  supabase: any,
  ownerId: string,
  overrides: {
    name?: string;
    createdAt?: string;
    trustScore?: number;
    trustFlags?: any[];
  } = {}
) {
  const payload: any = {
    owner_id: ownerId,
    name: overrides.name || "Integration Agent"
  };
  if (overrides.createdAt) payload.created_at = overrides.createdAt;
  if (typeof overrides.trustScore === "number") payload.trust_score = overrides.trustScore;
  if (Array.isArray(overrides.trustFlags)) payload.trust_flags = overrides.trustFlags;

  const { data, error } = await supabase
    .from("agents")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createActiveApiKeyDb(supabase: any, agentId: string) {
  const { apiKey, prefix, secret } = generateApiKey();
  const keyHash = await hashApiKeySecret(secret);
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      agent_id: agentId,
      key_prefix: prefix,
      key_hash: keyHash,
      key_state: "ACTIVE",
      scope: "full"
    })
    .select()
    .single();
  if (error) throw error;
  return { apiKey, apiKeyId: data.api_key_id };
}

export async function createGraceApiKeyDb(supabase: any, agentId: string, { expired = false } = {}) {
  const { apiKey, prefix, secret } = generateApiKey();
  const keyHash = await hashApiKeySecret(secret);
  const graceExpiresAt = expired
    ? new Date(Date.now() - 60 * 1000).toISOString()
    : new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      agent_id: agentId,
      key_prefix: prefix,
      key_hash: keyHash,
      key_state: "GRACE",
      scope: "full",
      grace_expires_at: graceExpiresAt
    })
    .select()
    .single();
  if (error) throw error;
  return { apiKey, apiKeyId: data.api_key_id };
}

export async function setupAgent(supabase: any) {
  const ownerId = randomId();
  await ensureOwnerDb(supabase, ownerId);
  const agent = await createAgentDb(supabase, ownerId);
  const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);
  return { ownerId, agent, apiKey };
}

export const OPS_CONSOLE_OWNER_ID = "00000000-0000-4000-a000-000000000000";
export const OPS_CONSOLE_AGENT_ID = "00000000-0000-4000-a000-000000000001";

export async function ensureOpsConsoleAgent(supabase: any) {
  await supabase.from("owners").upsert({
    owner_id: OPS_CONSOLE_OWNER_ID,
    email: "ops-console@clawdeals.internal",
    email_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Avoid race conditions when integration tests run with >1 worker.
  // If the agent already exists (seeded migration), ignore the duplicate.
  await supabase.from("agents").upsert(
    {
      id: OPS_CONSOLE_AGENT_ID,
      owner_id: OPS_CONSOLE_OWNER_ID,
      name: "ops-console",
      trust_score: 100,
      trust_flags: [],
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
}

export async function ensureEvidenceBucket(supabase: any) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const exists = Array.isArray(buckets) && buckets.some((b: any) => b?.name === "evidence");
  if (exists) return;

  const { error: createError } = await supabase.storage.createBucket("evidence", { public: false });
  if (createError && !/already exists/i.test(createError.message || "")) {
    throw createError;
  }
}

export async function createDisputeDb(
  supabase: any,
  {
    escrowId,
    status = "OPEN"
  }: {
    escrowId: string;
    status?: string;
  }
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("disputes")
    .insert({
      escrow_id: escrowId,
      status,
      created_at: nowIso,
      updated_at: nowIso
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
