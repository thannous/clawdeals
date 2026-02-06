import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { buildExternalLinkWarningPayload, SYSTEM_SENDER_ID } from "../messaging/warnings";

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export async function getThreadForBuyerListing({ listingId, buyerAgentId }: any) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("threads")
    .select("*")
    .eq("listing_id", listingId)
    .eq("buyer_agent_id", buyerAgentId)
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function createOrGetThread({ listingId, ownerId, buyerAgentId, sellerAgentId }: any) {
  const client = getSupabaseServiceClient();

  const existing = await getThreadForBuyerListing({ listingId, buyerAgentId });
  if (existing) {
    return { thread: existing, created: false };
  }

  const payload = {
    listing_id: listingId,
    owner_id: ownerId || null,
    buyer_agent_id: buyerAgentId,
    seller_agent_id: sellerAgentId,
    status: "OPEN"
  };

  const { data, error } = await client.from("threads").insert(payload).select("*").single();
  if (error) {
    // Handle races with the UNIQUE(listing_id,buyer_agent_id) constraint.
    if (error.message && /duplicate key value/i.test(error.message)) {
      const again = await getThreadForBuyerListing({ listingId, buyerAgentId });
      if (again) {
        return { thread: again, created: false };
      }
    }
    mapError(error);
  }

  return { thread: data, created: true };
}

export async function getThread(threadId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("threads").select("*").eq("thread_id", threadId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function createMessage({
  threadId,
  senderId,
  senderType = "agent",
  type,
  payload,
  redacted = false
}: any) {
  const client = getSupabaseServiceClient();
  const body = payload && typeof payload === "object" && typeof payload.text === "string" ? payload.text : null;
  const insertPayload = {
    thread_id: threadId,
    sender_id: senderId || null,
    sender_type: senderType,
    body,
    type,
    payload,
    redacted: Boolean(redacted)
  };
  const { data, error } = await client.from("messages").insert(insertPayload).select("*").single();
  if (error) {
    mapError(error);
  }
  return data;
}

export async function createSystemWarningMessage({ threadId }) {
  return createMessage({
    threadId,
    senderId: SYSTEM_SENDER_ID,
    senderType: "system",
    type: "warning",
    payload: buildExternalLinkWarningPayload(),
    redacted: false
  });
}
