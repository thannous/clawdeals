import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function isDuplicateKeyError(error) {
  return Boolean(error?.message) && /duplicate key value/i.test(error.message);
}

export async function getOpenOfferForThread({ threadId }: any) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("offers")
    .select("*")
    .eq("thread_id", threadId)
    .eq("status", "CREATED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function getOffer(offerId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("offers").select("*").eq("offer_id", offerId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function listOffersByIds(offerIds: string[] = []) {
  const ids = Array.from(
    new Set(
      Array.isArray(offerIds)
        ? offerIds.filter((id) => typeof id === "string" && id.trim())
        : []
    )
  );

  if (ids.length === 0) {
    return [];
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("offers")
    .select("offer_id,amount,currency,status,expires_at,created_at,previous_offer_id")
    .in("offer_id", ids);
  if (error) {
    mapError(error);
  }
  return data || [];
}

export async function createOffer({
  threadId,
  listingId,
  buyerAgentId,
  sellerAgentId,
  previousOfferId,
  amount,
  currency,
  expiresAt
}: any) {
  const client = getSupabaseServiceClient();
  const payload = {
    thread_id: threadId,
    listing_id: listingId,
    buyer_agent_id: buyerAgentId,
    seller_agent_id: sellerAgentId,
    proposed_by_agent_id: buyerAgentId,
    previous_offer_id: previousOfferId || null,
    amount,
    currency,
    expires_at: expiresAt,
    status: "CREATED"
  };

  const { data, error } = await client.from("offers").insert(payload).select("*").single();
  if (error) {
    // Handle races with the partial UNIQUE(thread_id) WHERE status='CREATED' constraint.
    if (isDuplicateKeyError(error)) {
      const openOffer = await getOpenOfferForThread({ threadId });
      throw Object.assign(new Error("Offer already open"), {
        status: 409,
        code: "OFFER_ALREADY_OPEN",
        details: { existing_offer_id: openOffer?.offer_id || null }
      });
    }
    mapError(error);
  }

  return data;
}

function isOfferNotCounterableError(error) {
  return Boolean(error?.message) && /offer not counterable|OFFER_NOT_COUNTERABLE/i.test(error.message);
}

function isOfferNotFoundError(error) {
  return Boolean(error?.message) && (/offer not found/i.test(error.message) || /OFFER_NOT_FOUND/i.test(error.message));
}

export async function counterOffer({
  previousOfferId,
  threadId,
  amount,
  currency,
  expiresAt,
  senderId
}: any) {
  const client = getSupabaseServiceClient();

  const { data, error } = await client
    .rpc("counter_offer_v0", {
      p_previous_offer_id: previousOfferId,
      p_amount: amount,
      p_currency: currency,
      p_expires_at: expiresAt,
      p_sender_id: senderId
    })
    .single();

  if (error) {
    if (isDuplicateKeyError(error)) {
      const openOffer = await getOpenOfferForThread({ threadId });
      throw Object.assign(new Error("Offer already open"), {
        status: 409,
        code: "OFFER_ALREADY_OPEN",
        details: { existing_offer_id: openOffer?.offer_id || null }
      });
    }
    if (isOfferNotCounterableError(error)) {
      const current = previousOfferId ? await getOffer(previousOfferId) : null;
      const expired = /OFFER_NOT_COUNTERABLE:EXPIRED/i.test(error?.message || "");
      throw Object.assign(new Error("Offer not counterable"), {
        status: 409,
        code: "OFFER_NOT_COUNTERABLE",
        details: { status: expired ? "EXPIRED" : current?.status || null }
      });
    }
    if (isOfferNotFoundError(error)) {
      throw Object.assign(new Error("Offer not found"), {
        status: 404,
        code: "OFFER_NOT_FOUND"
      });
    }
    mapError(error);
  }

  return data;
}

export function mapOfferActionError(error: any) {
  const message = error?.message || "";

  if (/OFFER_NOT_FOUND/i.test(message)) {
    return { status: 404, code: "OFFER_NOT_FOUND", message: "Offer not found" };
  }

  if (/LISTING_LOCKED/i.test(message)) {
    return { status: 409, code: "LISTING_LOCKED", message: "Listing locked" };
  }

  if (/OFFER_POLICY_REQUIRED/i.test(message)) {
    return {
      status: 409,
      code: "APPROVAL_REQUIRED",
      message: "Owner approval required",
      details: { action: "offer.accept" }
    };
  }

  const notActionableMatch = /OFFER_NOT_ACTIONABLE:([A-Z_]+)/i.exec(message);
  if (notActionableMatch) {
    return {
      status: 409,
      code: "OFFER_NOT_ACTIONABLE",
      message: "Offer not actionable",
      details: { status: notActionableMatch[1].toUpperCase() }
    };
  }

  const mapped = mapSupabaseError(error);
  return { status: mapped.status, code: mapped.code, message: mapped.message };
}

function throwOfferActionError(error: any) {
  const mapped = mapOfferActionError(error);
  throw Object.assign(new Error(mapped.message), {
    status: mapped.status,
    code: mapped.code,
    details: mapped.details
  });
}

export async function acceptOffer({ offerId, actorAgentId }: any) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("offer_accept_v0", {
      p_offer_id: offerId,
      p_actor_agent_id: actorAgentId
    })
    .single();

  if (error) {
    throwOfferActionError(error);
  }

  return data;
}

export async function declineOffer({ offerId, actorAgentId }: any) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("offer_decline_v0", {
      p_offer_id: offerId,
      p_actor_agent_id: actorAgentId
    })
    .single();

  if (error) {
    throwOfferActionError(error);
  }

  return data;
}

export async function cancelOffer({ offerId, actorAgentId }: any) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("offer_cancel_v0", {
      p_offer_id: offerId,
      p_actor_agent_id: actorAgentId
    })
    .single();

  if (error) {
    throwOfferActionError(error);
  }

  return data;
}

export async function listOffersByAgent({ agentIds, status, limit = 50, cursor }: any = {}) {
  const ids = Array.isArray(agentIds) ? agentIds.filter((id) => typeof id === "string" && id.trim()) : [];
  if (ids.length === 0) return { items: [], nextCursor: null };

  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? 50;
  const cappedLimit = Math.max(1, Math.min(100, pageLimit));
  const fetchLimit = cappedLimit + 1;

  let query = client
    .from("offers")
    .select("offer_id,thread_id,listing_id,buyer_agent_id,seller_agent_id,amount,currency,status,created_at,expires_at")
    .in("buyer_agent_id", ids)
    .order("created_at", { ascending: false })
    .order("offer_id", { ascending: false })
    .limit(fetchLimit);

  if (status) {
    query = query.eq("status", status);
  }

  if (cursor?.created_at && cursor?.offer_id) {
    const createdAt = `"${cursor.created_at}"`;
    const offerId = `"${cursor.offer_id}"`;
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},offer_id.lt.${offerId})`
    );
  }

  const { data, error } = await query;
  if (error) mapError(error);

  const rows = data || [];
  const hasMore = rows.length > cappedLimit;
  const items = hasMore ? rows.slice(0, cappedLimit) : rows;

  const nextCursor = hasMore && items.length > 0
    ? Buffer.from(JSON.stringify({
        created_at: items[items.length - 1].created_at,
        offer_id: items[items.length - 1].offer_id
      })).toString("base64")
    : null;

  return { items, nextCursor };
}
