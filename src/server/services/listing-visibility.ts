import { getSupabaseServiceClient } from "../db/supabase";

export async function isListingPubliclyVisible(listing: { listing_id: string; status: string } | null | undefined): Promise<boolean> {
  if (!listing || listing.status !== "LIVE") return false;

  const { data, error } = await getSupabaseServiceClient()
    .from("moderation_states")
    .select("entity_id")
    .eq("entity_type", "listing")
    .eq("entity_id", listing.listing_id)
    .eq("hidden", true)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error("Listing visibility is unavailable"), { status: 503, code: "VISIBILITY_UNAVAILABLE" });
  }
  return !data;
}
