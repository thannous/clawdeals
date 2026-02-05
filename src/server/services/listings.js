import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

export async function createListing({ title, description, status = "active", dealId, ownerId, agentId }) {
  const client = getSupabaseServiceClient();
  const payload = {
    title,
    description: description || null,
    status,
    deal_id: dealId || null,
    owner_id: ownerId || null,
    agent_id: agentId || null
  };
  const { data, error } = await client.from("listings").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}

export async function getListing(listingId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("listings").select("*").eq("id", listingId).maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || null;
}
