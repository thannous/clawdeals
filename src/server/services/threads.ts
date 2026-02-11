import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { buildExternalLinkWarningPayload, SYSTEM_SENDER_ID } from "../messaging/warnings";
import { encodeThreadsCursor } from "./threads-cursor";
import { encodeMessagesCursor } from "./messages-cursor";
import { isUuid } from "../utils/validators";

const DEFAULT_LIMIT = 50;
const THREAD_TYPE_MARKETPLACE = "MARKETPLACE";
const THREAD_TYPE_CONTROL_DM = "CONTROL_DM";
const CONTROL_DM_QUICK_ACTIONS = ["Help", "Approvals", "Connected Apps"];

function formatFilterValue(value) {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/"/g, "\\\"")}"`;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export async function getThreadForBuyerListing({ listingId, buyerAgentId }: any) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("threads")
    .select("*")
    .eq("thread_type", THREAD_TYPE_MARKETPLACE)
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
    thread_type: THREAD_TYPE_MARKETPLACE,
    listing_id: listingId,
    owner_id: ownerId || null,
    buyer_agent_id: buyerAgentId,
    seller_agent_id: sellerAgentId,
    status: "OPEN",
    control_owner_id: null,
    control_agent_id: null
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

function buildControlDmGreetingPayload() {
  return {
    type: "info",
    text: [
      "Control channel connected.",
      "Quick actions:",
      "- Help",
      "- Approvals",
      "- Connected Apps"
    ].join("\n"),
    quick_actions: CONTROL_DM_QUICK_ACTIONS
  };
}

export async function getControlDmThread({ ownerId, agentId }: any) {
  if (!isUuid(ownerId) || !isUuid(agentId)) {
    throw Object.assign(new Error("ownerId and agentId must be UUIDs"), {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("threads")
    .select("*")
    .eq("thread_type", THREAD_TYPE_CONTROL_DM)
    .eq("control_owner_id", ownerId)
    .eq("control_agent_id", agentId)
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function createOrGetControlDmThread({ ownerId, agentId }: any) {
  if (!isUuid(ownerId) || !isUuid(agentId)) {
    throw Object.assign(new Error("ownerId and agentId must be UUIDs"), {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const existing = await getControlDmThread({ ownerId, agentId });
  if (existing) {
    return { thread: existing, created: false };
  }

  const client = getSupabaseServiceClient();
  const payload = {
    thread_type: THREAD_TYPE_CONTROL_DM,
    owner_id: ownerId,
    control_owner_id: ownerId,
    control_agent_id: agentId,
    listing_id: null,
    buyer_agent_id: null,
    seller_agent_id: null,
    status: "OPEN"
  };

  let thread: any = null;
  const { data, error } = await client.from("threads").insert(payload).select("*").single();
  if (error) {
    // Handle races with the unique control-DM index.
    if (typeof error.message === "string" && /duplicate key value/i.test(error.message)) {
      const again = await getControlDmThread({ ownerId, agentId });
      if (again) {
        return { thread: again, created: false };
      }
    }
    mapError(error);
  } else {
    thread = data;
  }

  if (!thread) {
    const again = await getControlDmThread({ ownerId, agentId });
    if (!again) {
      throw Object.assign(new Error("Failed to create control DM thread"), {
        status: 500,
        code: "ERROR"
      });
    }
    return { thread: again, created: false };
  }

  await createMessage({
    threadId: thread.thread_id,
    senderId: SYSTEM_SENDER_ID,
    senderType: "system",
    type: "info",
    payload: buildControlDmGreetingPayload(),
    redacted: false
  });

  return { thread, created: true };
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

export async function listThreads({ listingId, buyerAgentId, sellerAgentId, status, limit, cursor }: any = {}) {
  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? DEFAULT_LIMIT;
  let query = client
    .from("threads")
    .select("*")
    .eq("thread_type", THREAD_TYPE_MARKETPLACE)
    .order("created_at", { ascending: false })
    .order("thread_id", { ascending: false })
    .limit(pageLimit + 1);

  if (listingId) {
    query = query.eq("listing_id", listingId);
  }
  if (buyerAgentId) {
    query = query.eq("buyer_agent_id", buyerAgentId);
  }
  if (sellerAgentId) {
    query = query.eq("seller_agent_id", sellerAgentId);
  }
  if (status) {
    query = query.eq("status", status);
  }

  if (cursor?.created_at && cursor?.thread_id) {
    const createdAt = formatFilterValue(cursor.created_at);
    const threadId = formatFilterValue(cursor.thread_id);
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},thread_id.lt.${threadId})`
    );
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const rows = data || [];
  const hasMore = rows.length > pageLimit;
  const items = hasMore ? rows.slice(0, pageLimit) : rows;
  const nextCursor = hasMore
    ? encodeThreadsCursor({
        created_at: items[items.length - 1].created_at,
        thread_id: items[items.length - 1].thread_id
      })
    : null;

  return { items, nextCursor };
}

export async function listMessages({ threadId, limit, cursor }: any = {}) {
  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? DEFAULT_LIMIT;
  let query = client
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .order("message_id", { ascending: true })
    .limit(pageLimit + 1);

  if (cursor?.created_at && cursor?.message_id) {
    const createdAt = formatFilterValue(cursor.created_at);
    const messageId = formatFilterValue(cursor.message_id);
    query = query.or(
      `created_at.gt.${createdAt},and(created_at.eq.${createdAt},message_id.gt.${messageId})`
    );
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const rows = data || [];
  const hasMore = rows.length > pageLimit;
  const items = hasMore ? rows.slice(0, pageLimit) : rows;
  const nextCursor = hasMore
    ? encodeMessagesCursor({
        created_at: items[items.length - 1].created_at,
        message_id: items[items.length - 1].message_id
      })
    : null;

  return { items, nextCursor };
}
