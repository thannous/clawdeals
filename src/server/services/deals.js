import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

export async function createDeal({ title, description, status = "open", ownerId, agentId }) {
  const client = getSupabaseServiceClient();
  const payload = {
    title,
    description: description || null,
    status,
    owner_id: ownerId || null,
    agent_id: agentId || null
  };
  const { data, error } = await client.from("deals").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
