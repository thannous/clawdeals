import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export type PspAccountRow = {
  psp_account_id: string;
  owner_id: string;
  psp_provider: string;
  psp_external_account_id: string;
  kyc_status: string;
  requirements_due: any;
  created_at: string;
  updated_at: string;
};

export async function getPspAccountForOwner(ownerId: string): Promise<PspAccountRow | null> {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("psp_accounts").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return (data as any) || null;
}

export async function upsertPspAccountForOwner({
  ownerId,
  provider,
  externalAccountId,
  kycStatus,
  requirementsDue
}: {
  ownerId: string;
  provider: string;
  externalAccountId: string;
  kycStatus: string;
  requirementsDue: any;
}): Promise<PspAccountRow> {
  const client = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const payload = {
    owner_id: ownerId,
    psp_provider: provider,
    psp_external_account_id: externalAccountId,
    kyc_status: kycStatus,
    requirements_due: requirementsDue ?? null,
    updated_at: nowIso
  };

  const { data, error } = await client
    .from("psp_accounts")
    .upsert(payload, { onConflict: "owner_id" })
    .select("*")
    .single();
  if (error) {
    mapError(error);
  }
  return data as any;
}

export async function updatePspAccountByExternalId({
  provider,
  externalAccountId,
  kycStatus,
  requirementsDue
}: {
  provider: string;
  externalAccountId: string;
  kycStatus: string;
  requirementsDue: any;
}): Promise<PspAccountRow | null> {
  const client = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const payload: any = {
    kyc_status: kycStatus,
    requirements_due: requirementsDue ?? null,
    updated_at: nowIso
  };

  const { data, error } = await client
    .from("psp_accounts")
    .update(payload)
    .eq("psp_provider", provider)
    .eq("psp_external_account_id", externalAccountId)
    .select("*")
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  return (data as any) || null;
}

