import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { getAgentById } from "./agents";
import { getOwner } from "./owners";
import { maskEmail, maskPhoneE164 } from "../utils/contact-masking";

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function mapRpcError(error: any) {
  const message = error?.message || "";

  if (/TX_NOT_FOUND/i.test(message)) {
    return { status: 404, code: "TX_NOT_FOUND", message: "Transaction not found" };
  }

  const notReadyMatch = /TX_NOT_READY:([A-Z_]+)/i.exec(message);
  if (notReadyMatch) {
    return {
      status: 409,
      code: "TX_NOT_READY",
      message: "Transaction not ready",
      details: { status: notReadyMatch[1].toUpperCase() }
    };
  }

  const notAcceptedMatch = /TX_NOT_ACCEPTED:([A-Z_]+)/i.exec(message);
  if (notAcceptedMatch) {
    return {
      status: 409,
      code: "TX_NOT_ACCEPTED",
      message: "Transaction not accepted",
      details: { status: notAcceptedMatch[1].toUpperCase() }
    };
  }

  const mapped = mapSupabaseError(error);
  return { status: mapped.status, code: mapped.code, message: mapped.message };
}

function throwRpcError(error: any) {
  const mapped = mapRpcError(error);
  throw Object.assign(new Error(mapped.message), {
    status: mapped.status,
    code: mapped.code,
    details: mapped.details
  });
}

export async function getTransaction(txId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("transactions").select("*").eq("tx_id", txId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function getContactRevealApprovalByTxId(txId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("approvals")
    .select("*")
    .eq("action_type", "contact_reveal")
    .eq("action_ref_id", txId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function requestContactReveal({
  txId,
  actorAgentId,
  autoApprove
}: {
  txId: string;
  actorAgentId: string;
  autoApprove: boolean;
}) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("transaction_request_contact_reveal_v0", {
      p_tx_id: txId,
      p_actor_agent_id: actorAgentId,
      p_auto_approve: autoApprove
    })
    .single();

  if (error) {
    throwRpcError(error);
  }

  return data;
}

export async function markTransactionCompleted({ txId, actorAgentId }: { txId: string; actorAgentId: string }) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("transaction_mark_completed_v0", {
      p_tx_id: txId,
      p_actor_agent_id: actorAgentId
    })
    .single();

  if (error) {
    throwRpcError(error);
  }

  return data;
}

function buildServiceError(message, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details && typeof details === "object") {
    error.details = details;
  }
  return error;
}

function isOwnerContactVerified(owner: any) {
  return Boolean(owner?.email) && Boolean(owner?.email_verified_at) && Boolean(owner?.phone_e164) && Boolean(owner?.phone_verified_at);
}

export async function getContactsForTransaction(
  tx: any,
  options: { revealToAgentId?: string | null } = {}
) {
  const buyerAgentId = tx?.buyer_agent_id;
  const sellerAgentId = tx?.seller_agent_id;
  if (!buyerAgentId || !sellerAgentId) {
    throw buildServiceError("Transaction parties missing", 500, "OWNER_CONTACT_MISSING");
  }

  const [buyerAgent, sellerAgent] = await Promise.all([getAgentById(buyerAgentId), getAgentById(sellerAgentId)]);
  if (!buyerAgent || !sellerAgent) {
    throw buildServiceError("Transaction parties missing", 500, "OWNER_CONTACT_MISSING");
  }

  const [buyerOwner, sellerOwner] = await Promise.all([getOwner(buyerAgent.owner_id), getOwner(sellerAgent.owner_id)]);
  if (!isOwnerContactVerified(buyerOwner) || !isOwnerContactVerified(sellerOwner)) {
    throw buildServiceError("Owner contact missing or unverified", 409, "OWNER_CONTACT_MISSING");
  }

  const buyerEmailMasked = maskEmail(buyerOwner.email);
  const buyerPhoneMasked = maskPhoneE164(buyerOwner.phone_e164);
  const sellerEmailMasked = maskEmail(sellerOwner.email);
  const sellerPhoneMasked = maskPhoneE164(sellerOwner.phone_e164);

  if (!buyerEmailMasked || !buyerPhoneMasked || !sellerEmailMasked || !sellerPhoneMasked) {
    throw buildServiceError("Owner contact missing or unverified", 409, "OWNER_CONTACT_MISSING");
  }

  const buyerContact: any = {
    email_masked: buyerEmailMasked,
    phone_masked: buyerPhoneMasked
  };
  const sellerContact: any = {
    email_masked: sellerEmailMasked,
    phone_masked: sellerPhoneMasked
  };

  // A transaction party only ever receives the counterparty's unmasked contact;
  // ops/console callers stay masked-only so no PII reaches audit or admin surfaces.
  const revealToAgentId = options.revealToAgentId || null;
  if (revealToAgentId === buyerAgentId) {
    sellerContact.email = sellerOwner.email;
    sellerContact.phone = sellerOwner.phone_e164;
  } else if (revealToAgentId === sellerAgentId) {
    buyerContact.email = buyerOwner.email;
    buyerContact.phone = buyerOwner.phone_e164;
  }

  return {
    buyer_contact: buyerContact,
    seller_contact: sellerContact
  };
}

export async function getMaskedContactsForTransaction(tx: any) {
  return getContactsForTransaction(tx);
}
