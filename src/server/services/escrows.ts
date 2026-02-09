import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export function mapEscrowRpcError(error: any) {
  const message = error?.message || "";

  if (/TX_NOT_FOUND/i.test(message)) {
    return { status: 404, code: "TX_NOT_FOUND", message: "Transaction not found" };
  }

  const txNotReady = /TX_NOT_READY:([A-Z_]+)/i.exec(message);
  if (txNotReady) {
    return {
      status: 409,
      code: "TX_NOT_READY",
      message: "Transaction not ready",
      details: { status: txNotReady[1].toUpperCase() }
    };
  }

  if (/ESCROW_ALREADY_EXISTS/i.test(message)) {
    return { status: 409, code: "ESCROW_ALREADY_EXISTS", message: "Escrow already exists" };
  }

  if (/ESCROW_NOT_FOUND/i.test(message)) {
    return { status: 404, code: "ESCROW_NOT_FOUND", message: "Escrow not found" };
  }

  const notActionable = /ESCROW_NOT_ACTIONABLE:([A-Z_]+)/i.exec(message);
  if (notActionable) {
    return {
      status: 409,
      code: "ESCROW_NOT_ACTIONABLE",
      message: "Escrow not actionable",
      details: { status: notActionable[1].toUpperCase() }
    };
  }

  const invalidState = /INVALID_STATE:([A-Z_]+)/i.exec(message);
  if (invalidState) {
    return {
      status: 409,
      code: "INVALID_STATE",
      message: "Invalid escrow state",
      details: { status: invalidState[1].toUpperCase() }
    };
  }

  if (/ESCROW_FINALIZED/i.test(message)) {
    return { status: 409, code: "ESCROW_FINALIZED", message: "Escrow finalized" };
  }

  if (/ESCROW_PAYMENT_ALREADY_SET/i.test(message)) {
    return { status: 409, code: "ESCROW_PAYMENT_ALREADY_SET", message: "Escrow payment already set" };
  }

  const mapped = mapSupabaseError(error);
  return { status: mapped.status, code: mapped.code, message: mapped.message };
}

function throwEscrowRpcError(error: any) {
  const mapped = mapEscrowRpcError(error);
  throw Object.assign(new Error(mapped.message), {
    status: mapped.status,
    code: mapped.code,
    details: mapped.details
  });
}

export async function getEscrowById(escrowId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("escrows").select("*").eq("escrow_id", escrowId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function getEscrowByTxId(txId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("escrows").select("*").eq("tx_id", txId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function getEscrowByPaymentId(paymentId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("escrows").select("*").eq("psp_payment_id", paymentId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function getEscrowByPayoutId(payoutId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("escrows").select("*").eq("psp_payout_id", payoutId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function getEscrowByRefundId(refundId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("escrows").select("*").eq("psp_refund_id", refundId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function createEscrow({
  txId,
  actorAgentId,
  feeBps
}: {
  txId: string;
  actorAgentId: string;
  feeBps: number;
}) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("escrow_create_v0", {
      p_tx_id: txId,
      p_actor_agent_id: actorAgentId,
      p_fee_bps: feeBps
    })
    .single();
  if (error) {
    throwEscrowRpcError(error);
  }
  return data;
}

export async function setEscrowPayment({
  escrowId,
  actorAgentId,
  provider,
  paymentId
}: {
  escrowId: string;
  actorAgentId: string;
  provider: string;
  paymentId: string;
}) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("escrow_set_payment_v0", {
      p_escrow_id: escrowId,
      p_actor_agent_id: actorAgentId,
      p_psp_provider: provider,
      p_psp_payment_id: paymentId
    })
    .single();
  if (error) {
    throwEscrowRpcError(error);
  }
  return data;
}

export async function markEscrowHold({
  paymentId,
  holdId,
  holdExpiresAt
}: {
  paymentId: string;
  holdId?: string | null;
  holdExpiresAt?: string | null;
}) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("escrow_mark_hold_v0", {
      p_psp_payment_id: paymentId,
      p_psp_hold_id: holdId ?? null,
      p_hold_expires_at: holdExpiresAt ?? null
    })
    .single();
  if (error) {
    throwEscrowRpcError(error);
  }
  return data;
}

export async function markEscrowDelivered({ escrowId, actorAgentId }: { escrowId: string; actorAgentId: string }) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("escrow_mark_delivered_v0", {
      p_escrow_id: escrowId,
      p_actor_agent_id: actorAgentId
    })
    .single();
  if (error) {
    throwEscrowRpcError(error);
  }
  return data;
}

export async function markEscrowConfirmed({ escrowId, actorAgentId }: { escrowId: string; actorAgentId: string }) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("escrow_mark_confirmed_v0", {
      p_escrow_id: escrowId,
      p_actor_agent_id: actorAgentId
    })
    .single();
  if (error) {
    throwEscrowRpcError(error);
  }
  return data;
}

export async function setEscrowReleasePending({ escrowId, payoutId }: { escrowId: string; payoutId: string }) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("escrow_set_release_pending_v0", {
      p_escrow_id: escrowId,
      p_psp_payout_id: payoutId
    })
    .single();
  if (error) {
    throwEscrowRpcError(error);
  }
  return data;
}

export async function markEscrowReleased({ payoutId }: { payoutId: string }) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("escrow_mark_released_v0", {
      p_psp_payout_id: payoutId
    })
    .single();
  if (error) {
    throwEscrowRpcError(error);
  }
  return data;
}

export async function markEscrowRefunded({ refundId }: { refundId: string }) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("escrow_mark_refunded_v0", {
      p_psp_refund_id: refundId
    })
    .single();
  if (error) {
    throwEscrowRpcError(error);
  }
  return data;
}
