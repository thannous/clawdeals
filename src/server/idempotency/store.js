import { getSupabaseServiceClient } from "../db/supabase";

const TABLE = "idempotency_keys";

export async function getIdempotencyRecord({ actorType, actorId, method, path, key }) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("actor_type", actorType)
    .eq("actor_id", actorId)
    .eq("method", method)
    .eq("path", path)
    .eq("idempotency_key", key)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read idempotency record: ${error.message}`);
  }
  return data || null;
}

export async function insertIdempotencyRecord(payload) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from(TABLE).insert(payload).select().single();
  if (error) {
    throw new Error(`Failed to insert idempotency record: ${error.message}`);
  }
  return data;
}

export async function updateIdempotencyRecord(idempotencyId, updates) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from(TABLE)
    .update(updates)
    .eq("idempotency_id", idempotencyId)
    .select()
    .single();
  if (error) {
    throw new Error(`Failed to update idempotency record: ${error.message}`);
  }
  return data;
}

export async function deleteIdempotencyRecord(idempotencyId) {
  const client = getSupabaseServiceClient();
  const { error } = await client.from(TABLE).delete().eq("idempotency_id", idempotencyId);
  if (error) {
    throw new Error(`Failed to delete idempotency record: ${error.message}`);
  }
}

export async function deleteExpiredIdempotency({ now = new Date() } = {}) {
  const client = getSupabaseServiceClient();
  const { error, count } = await client
    .from(TABLE)
    .delete({ count: "exact" })
    .lt("expires_at", now.toISOString());
  if (error) {
    throw new Error(`Failed to delete expired idempotency records: ${error.message}`);
  }
  return { deleted: count };
}
