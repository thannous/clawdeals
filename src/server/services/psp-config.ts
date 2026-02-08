import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export type PspConfigRow = {
  psp_config_id: string;
  singleton_key: string;
  provider: string;
  mode: string;
  webhook_secret_ref: string;
  platform_fee_bps_default: number;
  created_at: string;
  updated_at: string;
};

export async function getPspConfig(): Promise<PspConfigRow | null> {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("psp_config").select("*").eq("singleton_key", "psp_config_v0").maybeSingle();
  if (error) {
    mapError(error);
  }
  return (data as any) || null;
}

export async function upsertPspConfig({
  provider,
  mode,
  webhookSecretRef,
  platformFeeBpsDefault
}: {
  provider: string;
  mode: string;
  webhookSecretRef: string;
  platformFeeBpsDefault: number;
}): Promise<PspConfigRow> {
  const client = getSupabaseServiceClient();
  const nowIso = new Date().toISOString();
  const payload = {
    singleton_key: "psp_config_v0",
    provider,
    mode,
    webhook_secret_ref: webhookSecretRef,
    platform_fee_bps_default: platformFeeBpsDefault,
    updated_at: nowIso
  };

  const { data, error } = await client
    .from("psp_config")
    .upsert(payload, { onConflict: "singleton_key" })
    .select("*")
    .single();
  if (error) {
    mapError(error);
  }
  return data as any;
}

