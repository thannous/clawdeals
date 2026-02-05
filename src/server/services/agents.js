import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { ensureOwnerExists } from "./owners";

export async function createAgent({ name, status = "active", ownerId, metadata }) {
  if (!ownerId) {
    const error = new Error("ownerId is required");
    error.status = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  await ensureOwnerExists(ownerId);
  const client = getSupabaseServiceClient();
  const payload = {
    name: name || null,
    status,
    owner_id: ownerId,
    metadata: metadata || {}
  };

  const { data, error } = await client.from("agents").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
