import { assertRehearsalEffectAllowed } from "../config/rehearsal";
import { createClient } from "@supabase/supabase-js";
import { getDatabaseBackend } from "../config/backends";
import { getNeonDataClient } from "./neon-client";
import { getEnv } from "../config/env";

let serviceClient;

function getSupabaseOnlyClient() {
  assertRehearsalEffectAllowed("db/supabase");
  if (!serviceClient) {
    const url = getEnv("SUPABASE_URL", { required: true });
    const key = getEnv("SUPABASE_SERVICE_ROLE_KEY", { required: true });
    serviceClient = createClient(url, key, {
      auth: { persistSession: false }
    });
  }
  return serviceClient;
}

/** Historical export retained for domain call sites and test fixtures. Auth and
 * storage stay independently selected and lazy; no data fallback after errors. */
export function getSupabaseServiceClient(): any {
  if (getDatabaseBackend() === "supabase") return getSupabaseOnlyClient();
  const data = getNeonDataClient();
  return {
    from: data.from,
    rpc: data.rpc,
    get auth() { return getSupabaseOnlyClient().auth; },
    get storage() { return getSupabaseOnlyClient().storage; }
  };
}
