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
    throw Object.assign(new Error(`Failed to read idempotency record: ${error.message}`), {
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null
    });
  }
  return data || null;
}

export async function insertIdempotencyRecord(payload) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from(TABLE).insert(payload).select().single();
  if (error) {
    throw Object.assign(new Error(`Failed to insert idempotency record: ${error.message}`), {
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null
    });
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
    throw Object.assign(new Error(`Failed to update idempotency record: ${error.message}`), {
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null
    });
  }
  return data;
}

export async function claimExpiredIdempotencyRecord({ idempotencyId, nowIso, expiresAt }) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from(TABLE)
    .update({
      status: "IN_PROGRESS",
      expires_at: expiresAt,
      response_status: null,
      response_headers: null,
      response_body: null,
      response_body_encrypted: null,
      entity_type: null,
      entity_id: null
    })
    .eq("idempotency_id", idempotencyId)
    .in("status", ["COMPLETED", "FAILED"])
    .lte("expires_at", nowIso)
    .select()
    .maybeSingle();
  if (error) {
    throw Object.assign(new Error(`Failed to claim expired idempotency record: ${error.message}`), {
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null
    });
  }
  return data || null;
}

export async function deleteIdempotencyRecord(idempotencyId) {
  const client = getSupabaseServiceClient();
  const { error } = await client.from(TABLE).delete().eq("idempotency_id", idempotencyId);
  if (error) {
    throw Object.assign(new Error(`Failed to delete idempotency record: ${error.message}`), {
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null
    });
  }
}

export async function deleteExpiredIdempotency({ now = new Date() } = {}) {
  const client = getSupabaseServiceClient();
  const { error, count } = await client
    .from(TABLE)
    .delete({ count: "exact" })
    .lt("expires_at", now.toISOString());
  if (error) {
    throw Object.assign(new Error(`Failed to delete expired idempotency records: ${error.message}`), {
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null
    });
  }
  return { deleted: count };
}
