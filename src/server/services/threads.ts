import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { buildExternalLinkWarningBody, SYSTEM_SENDER_ID } from "../messaging/warnings";

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

export async function createMessage({
  threadId,
  body,
  senderId,
  senderType = "agent",
  messageType,
  redacted = false
}) {
  const client = getSupabaseServiceClient();
  const payload = {
    thread_id: threadId,
    body,
    sender_id: senderId || null,
    sender_type: senderType,
    message_type: messageType || null,
    redacted: Boolean(redacted)
  };
  const { data, error } = await client.from("messages").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}

export async function createSystemWarningMessage({ threadId }) {
  return createMessage({
    threadId,
    body: buildExternalLinkWarningBody(),
    senderId: SYSTEM_SENDER_ID,
    senderType: "system",
    messageType: "warning",
    redacted: false
  });
}
