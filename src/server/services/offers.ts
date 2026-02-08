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
