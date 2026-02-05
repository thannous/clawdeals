import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

export async function listPolicies() {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("policies").select("*").order("created_at", { ascending: false });
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || [];
}

export async function createPolicy({ name, status = "active", body }) {
  const client = getSupabaseServiceClient();
  const payload = {
    name: name || null,
    status,
    body: body || {}
  };
  const { data, error } = await client.from("policies").insert(payload).select().single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}
