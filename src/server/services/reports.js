import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

export async function createReport({ subject, description, status = "open", actorId }) {
  const client = getSupabaseServiceClient();
  const payload = {
    subject,
    description: description || null,
    status,
    actor_id: actorId || null
  };
  const { data, error } = await client.from("reports").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
