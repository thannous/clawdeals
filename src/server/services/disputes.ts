import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export function mapDisputeRpcError(error: any) {
  const message = error?.message || "";

  if (/DISPUTE_ALREADY_EXISTS/i.test(message)) {
    return { status: 409, code: "DISPUTE_ALREADY_EXISTS", message: "Dispute already exists" };
  }

  if (/DISPUTE_NOT_FOUND/i.test(message)) {
    return { status: 404, code: "DISPUTE_NOT_FOUND", message: "Dispute not found" };
  }

  if (/DISPUTE_ALREADY_RESOLVED/i.test(message)) {
    return { status: 409, code: "DISPUTE_ALREADY_RESOLVED", message: "Dispute already resolved" };
  }

  if (/ESCROW_NOT_FOUND/i.test(message)) {
    return { status: 404, code: "ESCROW_NOT_FOUND", message: "Escrow not found" };
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

  const validation = /VALIDATION_ERROR:([A-Z_]+)/i.exec(message);
  if (validation) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation error",
      details: { field: validation[1].toUpperCase() }
    };
  }

  if (/ESCROW_FINALIZED/i.test(message)) {
    return { status: 409, code: "ESCROW_FINALIZED", message: "Escrow finalized" };
  }

  const mapped = mapSupabaseError(error);
  return { status: mapped.status, code: mapped.code, message: mapped.message };
}

function throwDisputeRpcError(error: any) {
  const mapped = mapDisputeRpcError(error);
  throw Object.assign(new Error(mapped.message), {
    status: mapped.status,
    code: mapped.code,
    details: mapped.details
  });
}

export async function getDisputeById(disputeId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("disputes").select("*").eq("dispute_id", disputeId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function openDispute({
  escrowId,
  actorAgentId,
  reasonCode,
  openedNotesRedacted
}: {
  escrowId: string;
  actorAgentId: string;
  reasonCode: string;
  openedNotesRedacted?: string | null;
}) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("dispute_open_v0", {
      p_escrow_id: escrowId,
      p_actor_agent_id: actorAgentId,
      p_reason_code: reasonCode,
      p_opened_notes_redacted: openedNotesRedacted ?? null
    })
    .single();
  if (error) {
    throwDisputeRpcError(error);
  }
  return data;
}

export async function resolveDispute({
  disputeId,
  resolution,
  resolutionNotesRedacted,
  pspReferenceId
}: {
  disputeId: string;
  resolution: "REFUND" | "RELEASE";
  resolutionNotesRedacted?: string | null;
  pspReferenceId: string;
}) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("dispute_resolve_v0", {
      p_dispute_id: disputeId,
      p_resolution: resolution,
      p_resolution_notes_redacted: resolutionNotesRedacted ?? null,
      p_psp_reference_id: pspReferenceId
    })
    .single();
  if (error) {
    throwDisputeRpcError(error);
  }
  return data;
}

export async function beginResolveDispute({ disputeId }: { disputeId: string }) {
  const client = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  // Atomically "claim" the dispute for resolution so concurrent resolve calls
  // can't both trigger PSP side-effects.
  const { data: updated, error: updateError } = await client
    .from("disputes")
    .update({ status: "UNDER_REVIEW", updated_at: nowIso })
    .eq("dispute_id", disputeId)
    .eq("status", "OPEN")
    .select("*")
    .maybeSingle();

  if (updateError) {
    mapError(updateError);
  }
  if (updated) {
    return { state: "locked" as const, dispute: updated };
  }

  const current = await getDisputeById(disputeId);
  if (!current) {
    throw Object.assign(new Error("Dispute not found"), { status: 404, code: "DISPUTE_NOT_FOUND" });
  }
  if (current.status === "RESOLVED") {
    return { state: "already_resolved" as const, dispute: current };
  }
  if (current.status === "UNDER_REVIEW") {
    throw Object.assign(new Error("Dispute resolution in progress"), {
      status: 409,
      code: "DISPUTE_RESOLUTION_IN_PROGRESS"
    });
  }

  throw Object.assign(new Error("Dispute not resolvable in current state"), {
    status: 409,
    code: "INVALID_STATE",
    details: { status: current.status }
  });
}

export async function rollbackResolveDisputeLock({ disputeId }: { disputeId: string }) {
  const client = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await client
    .from("disputes")
    .update({ status: "OPEN", updated_at: nowIso })
    .eq("dispute_id", disputeId)
    .eq("status", "UNDER_REVIEW");
  if (error) {
    mapError(error);
  }
  return { ok: true as const };
}
