import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

export async function createAgent({ name, status = "active", ownerId, metadata }) {
  const client = getSupabaseServiceClient();
  const payload = {
    name: name || null,
    status,
    owner_id: ownerId || null,
    metadata: metadata || {}
  };

  const { data, error } = await client.from("agents").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
