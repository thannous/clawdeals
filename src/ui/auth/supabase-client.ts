import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createClient> | null = null;

function requireEnv(name: string, value: string | undefined) {
  if (value && value.trim()) return value;
  throw new Error(`Missing required public env var: ${name}`);
}

export function getBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  return browserClient;
}
