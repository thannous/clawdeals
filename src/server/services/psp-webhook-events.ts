import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function isDuplicateKeyError(error: any) {
  return Boolean(error?.message) && /duplicate key value/i.test(error.message);
}

export type PspWebhookEventRow = {
  id: string;
  psp_provider: string;
  psp_event_id: string;
  type: string;
  status: string;
  escrow_id: string | null;
  psp_external_account_id: string | null;
  payload: any;
  error: string | null;
  received_at: string;
  applied_at: string | null;
};

export async function insertPspWebhookEvent({
  provider,
  eventId,
  type,
  escrowId,
  externalAccountId,
  payload
}: {
  provider: string;
  eventId: string;
  type: string;
  escrowId?: string | null;
  externalAccountId?: string | null;
  payload: any;
}): Promise<{ ok: true; row: PspWebhookEventRow; duplicate: boolean }> {
  const client = getSupabaseServiceClient();
  const insertPayload: any = {
    psp_provider: provider,
    psp_event_id: eventId,
    type,
    status: "RECEIVED",
    escrow_id: escrowId ?? null,
    psp_external_account_id: externalAccountId ?? null,
    payload: payload ?? {}
  };

  const { data, error } = await client
    .from("psp_webhook_events")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    if (isDuplicateKeyError(error)) {
      const { data: existing, error: fetchError } = await client
        .from("psp_webhook_events")
        .select("*")
        .eq("psp_provider", provider)
        .eq("psp_event_id", eventId)
        .maybeSingle();
      if (fetchError) {
        mapError(fetchError);
      }
      return { ok: true, row: existing as any, duplicate: true };
    }
    mapError(error);
  }

  return { ok: true, row: data as any, duplicate: false };
}

export async function updatePspWebhookEventStatus({
  id,
  status,
  error,
  escrowId,
  appliedAt
}: {
  id: string;
  status: string;
  error?: string | null;
  escrowId?: string | null;
  appliedAt?: string | null;
}): Promise<PspWebhookEventRow> {
  const client = getSupabaseServiceClient();
  const payload: any = {
    status
  };
  if (error !== undefined) payload.error = error;
  if (escrowId !== undefined) payload.escrow_id = escrowId;
  if (appliedAt !== undefined) payload.applied_at = appliedAt;

  const { data, error: updateError } = await client
    .from("psp_webhook_events")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) {
    mapError(updateError);
  }
  return data as any;
}

export async function listPendingPspWebhookEventsForEscrow({
  escrowId,
  limit = 50
}: {
  escrowId: string;
  limit?: number;
}): Promise<PspWebhookEventRow[]> {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("psp_webhook_events")
    .select("*")
    .eq("escrow_id", escrowId)
    .eq("status", "PENDING_RETRY")
    .order("received_at", { ascending: true })
    .limit(limit);
  if (error) {
    mapError(error);
  }
  return (data as any) || [];
}

