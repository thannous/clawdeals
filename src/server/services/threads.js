import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

export async function createThread({ listingId, ownerId, agentId }) {
  const client = getSupabaseServiceClient();
  const payload = {
    listing_id: listingId,
    owner_id: ownerId || null,
    agent_id: agentId || null
  };
  const { data, error } = await client.from("threads").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}

export async function getThread(threadId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("threads").select("*").eq("id", threadId).maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || null;
}

export async function createMessage({ threadId, body, senderId, senderType = "agent" }) {
  const client = getSupabaseServiceClient();
  const payload = {
    thread_id: threadId,
    body,
    sender_id: senderId || null,
    sender_type: senderType
  };
  const { data, error } = await client.from("messages").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
