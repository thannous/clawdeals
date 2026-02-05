import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../config/env";

let serviceClient;

export function getSupabaseServiceClient() {
  if (!serviceClient) {
    const url = getEnv("SUPABASE_URL", { required: true });
    const key = getEnv("SUPABASE_SERVICE_ROLE_KEY", { required: true });
    serviceClient = createClient(url, key, {
      auth: { persistSession: false }
    });
  }
  return serviceClient;
}
