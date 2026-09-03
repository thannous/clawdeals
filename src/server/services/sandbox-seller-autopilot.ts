import { getSupabaseServiceClient } from "../db/supabase";
import { OFFERS_TTL_MIN_SECONDS, OFFERS_TTL_WINDOW_SECONDS } from "../config/offers";
import { acceptOffer, counterOffer } from "./offers";
import { mapSupabaseError } from "./supabase-errors";

/**
 * Deterministic synthetic seller for the WebMCP judge sandbox.
 *
 * The seller "agent" never runs an LLM: below its floor it counters at a fixed amount that sits
 * above the judge mission's 1,300 EUR hard budget, so the buyer agent's next `accept` is refused
 * server-side with APPROVAL_REQUIRED. At or above the floor it accepts atomically.
 */
export const SANDBOX_SELLER_FLOOR_AMOUNT = 1250;
export const SANDBOX_SELLER_COUNTER_AMOUNT = 1350;
const SANDBOX_SELLER_COUNTER_TTL_SECONDS = 24 * 60 * 60;
const SANDBOX_JUDGE_SELLER_SYSTEM = "sandbox.ebike-seller.judge";

export type SellerTurnDecision = { action: "accept" } | { action: "counter"; amount: number };

export type SellerTurnResult = {
  action: "accept" | "counter" | "noop";
  idempotent: boolean;
  reason: string | null;
  offer: {
    offer_id: string;
    previous_offer_id: string | null;
    thread_id: string;
    listing_id: string;
    amount: number;
    currency: string;
    status: string;
    expires_at: string | null;
  };
  listing_status: string | null;
  transaction: { tx_id: string | null; status: string | null } | null;
};

function serviceError(message: string, status: number, code: string, details?: Record<string, unknown>) {
  return Object.assign(new Error(message), { status, code, details });
}

function mapError(error: any): never {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export function decideSellerTurn(offer: { amount: number }): SellerTurnDecision {
  if (typeof offer.amount === "number" && offer.amount >= SANDBOX_SELLER_FLOOR_AMOUNT) {
    return { action: "accept" };
  }
  return { action: "counter", amount: SANDBOX_SELLER_COUNTER_AMOUNT };
}

function counterExpiresAt(now: Date): string {
  const ttl = Math.max(OFFERS_TTL_MIN_SECONDS, Math.min(SANDBOX_SELLER_COUNTER_TTL_SECONDS, OFFERS_TTL_WINDOW_SECONDS));
  return new Date(now.getTime() + ttl * 1000).toISOString();
}

function compactOffer(offer: any): SellerTurnResult["offer"] {
  return {
    offer_id: String(offer.offer_id),
    previous_offer_id: offer.previous_offer_id ? String(offer.previous_offer_id) : null,
    thread_id: String(offer.thread_id || ""),
    listing_id: String(offer.listing_id || ""),
    amount: Number(offer.amount),
    currency: String(offer.currency || ""),
    status: String(offer.status || ""),
    expires_at: offer.expires_at ? String(offer.expires_at) : null
  };
}

export async function runSandboxSellerTurn({
  buyerAgentId,
  judgeAgentId,
  now = new Date()
}: {
  buyerAgentId: string;
  judgeAgentId: string;
  now?: Date;
}): Promise<SellerTurnResult> {
  const client = getSupabaseServiceClient();

  const { data: seller, error: sellerError } = await client
    .from("agents")
    .select("id")
    .contains("metadata", { system: SANDBOX_JUDGE_SELLER_SYSTEM, env: "sandbox", judge_agent_id: judgeAgentId })
    .limit(1)
    .maybeSingle();
  if (sellerError) mapError(sellerError);
  if (!seller?.id) {
    throw serviceError("Synthetic seller not provisioned. Run the judge reset first.", 409, "SELLER_NOT_READY");
  }
  const sellerAgentId = String(seller.id);

  const { data: latest, error: offerError } = await client
    .from("offers")
    .select("*")
    .eq("seller_agent_id", sellerAgentId)
    .eq("buyer_agent_id", buyerAgentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (offerError) mapError(offerError);
  if (!latest) {
    throw serviceError("No offer from the buyer agent yet. Ask the agent to make an offer first.", 409, "NO_OPEN_OFFER");
  }

  const status = String(latest.status || "");
  if (status === "ACCEPTED") {
    return {
      action: "noop",
      idempotent: true,
      reason: "already_accepted",
      offer: compactOffer(latest),
      listing_status: "RESERVED",
      transaction: null
    };
  }
  if (status !== "CREATED") {
    throw serviceError("The latest offer is not open.", 409, "NO_OPEN_OFFER", { status });
  }
  const expiresAt = latest.expires_at ? new Date(latest.expires_at) : null;
  if (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) {
    throw serviceError("The latest offer has expired.", 409, "NO_OPEN_OFFER", { status: "EXPIRED" });
  }

  // A second click while the seller's own counter is still open must not stack a new counter.
  if (String(latest.proposed_by_agent_id || "") === sellerAgentId) {
    return {
      action: "counter",
      idempotent: true,
      reason: "seller_counter_already_open",
      offer: compactOffer(latest),
      listing_status: null,
      transaction: null
    };
  }

  const decision = decideSellerTurn({ amount: Number(latest.amount) });

  if (decision.action === "accept") {
    const accepted: any = await acceptOffer({ offerId: String(latest.offer_id), actorAgentId: sellerAgentId });
    const transaction = accepted?.transaction || {};
    return {
      action: "accept",
      idempotent: false,
      reason: `amount_at_or_above_floor_${SANDBOX_SELLER_FLOOR_AMOUNT}`,
      offer: compactOffer({ ...latest, status: accepted?.status || "ACCEPTED" }),
      listing_status: accepted?.listing_status ? String(accepted.listing_status) : "RESERVED",
      transaction: {
        tx_id: transaction.tx_id ? String(transaction.tx_id) : null,
        status: transaction.status ? String(transaction.status) : null
      }
    };
  }

  const next: any = await counterOffer({
    previousOfferId: String(latest.offer_id),
    threadId: String(latest.thread_id),
    amount: decision.amount,
    currency: String(latest.currency),
    expiresAt: counterExpiresAt(now),
    senderId: sellerAgentId
  });
  return {
    action: "counter",
    idempotent: false,
    reason: `amount_below_floor_${SANDBOX_SELLER_FLOOR_AMOUNT}`,
    offer: compactOffer(next),
    listing_status: null,
    transaction: null
  };
}
