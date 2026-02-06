import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const DUPLICATE_KEY_REGEX = /duplicate key value/i;

export async function createWatchlistSignup({ email, locale, source }) {
  const client = getSupabaseServiceClient();
  const payload = {
    email,
    locale: typeof locale === "string" && locale.trim() ? locale.trim() : null,
    source: typeof source === "string" && source.trim() ? source.trim() : null
  };

  const { data, error } = await client.from("watchlist_signups").insert(payload).select().single();
  if (error) {
    if (error.code === "23505" || DUPLICATE_KEY_REGEX.test(error.message || "")) {
      return { status: "already_registered", data: null };
    }
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return { status: "created", data };
}
