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

function isMissingDealMediaColumns(error: any) {
  const message = error?.message || "";
  if (typeof message !== "string") return false;
  const referencesMediaColumns = message.includes("images") || message.includes("cover_image_index");
  const missingColumnHint = message.includes("does not exist") || message.toLowerCase().includes("schema cache");
  return referencesMediaColumns && missingColumnHint;
}

export async function getDealById({ dealId }: any = {}) {
  if (!dealId || typeof dealId !== "string") {
    throw buildServiceError("dealId is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const selectWithMedia =
    "deal_id, title, source_url, price, currency, market_code, expires_at, status, temperature, votes_up, votes_down, tags, reasons_count, deal_type, country, merchant_name, merchant_domain, images, cover_image_index, created_at";
  const selectWithoutMedia =
    "deal_id, title, source_url, price, currency, market_code, expires_at, status, temperature, votes_up, votes_down, tags, reasons_count, deal_type, country, merchant_name, merchant_domain, created_at";

  let { data, error } = await client
    .from("deals")
    .select(selectWithMedia)
    .eq("deal_id", dealId)
    .maybeSingle();

  // Backward compatibility: tolerate DBs where media columns are not yet migrated.
  if (error && isMissingDealMediaColumns(error)) {
    ({ data, error } = await client
      .from("deals")
      .select(selectWithoutMedia)
      .eq("deal_id", dealId)
      .maybeSingle());
    if (!error && data) {
      data = { ...data, images: null, cover_image_index: null };
    }
  }

  if (error) {
    mapError(error);
  }

  if (!data) {
    throw buildServiceError("Deal not found", 404, "DEAL_NOT_FOUND");
  }

  return data;
}
