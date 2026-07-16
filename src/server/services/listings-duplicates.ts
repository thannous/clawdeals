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

const DUPLICATE_STATES = ["LIVE", "PENDING_APPROVAL", "RESERVED", "CONTACT_REVEALED"];

export async function findListingDuplicate({ fingerprint, marketCode }: { fingerprint: string; marketCode: string }) {
  if (!fingerprint || typeof fingerprint !== "string") return null;

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("listings")
    .select("listing_id,created_at,status")
    .eq("duplicate_fingerprint", fingerprint)
    .eq("market_code", marketCode)
    .eq("duplicate_override", false)
    .in("status", DUPLICATE_STATES as any)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const message = error?.message ? String(error.message) : "";
    const missingCols =
      message.includes("duplicate_fingerprint") ||
      message.includes("duplicate_override") ||
      message.toLowerCase().includes("schema cache");
    if (missingCols) {
      // If the DB hasn't been migrated for listing dedupe, treat as "no duplicate".
      return null;
    }
    mapError(error);
  }

  if (!data) return null;

  return {
    listing_id: data.listing_id,
    created_at: data.created_at,
    status: data.status
  };
}
