import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function buildServiceError(message, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

export async function getDealById({ dealId }: any = {}) {
  if (!dealId || typeof dealId !== "string") {
    throw buildServiceError("dealId is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("deals")
    .select(
      "deal_id, title, source_url, price, currency, expires_at, status, temperature, votes_up, votes_down, tags, reasons_count, deal_type, country, merchant_name, merchant_domain, images, cover_image_index, created_at"
    )
    .eq("deal_id", dealId)
    .maybeSingle();

  if (error) {
    mapError(error);
  }

  if (!data) {
    throw buildServiceError("Deal not found", 404, "DEAL_NOT_FOUND");
  }

  return data;
}
