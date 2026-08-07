import { createAuthClient as createNeonAuthClient } from "@neondatabase/auth";
import { SupabaseAuthAdapter } from "@neondatabase/auth/vanilla/adapters";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let browserClient: any = null;

function requireEnv(name: string, value: string | undefined) {
  if (value && value.trim()) return value;
  throw new Error(`Missing required public env var: ${name}`);
}

function getPublicAuthBackend() {
  const backend = (process.env.NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND || "supabase").trim().toLowerCase();
  if (backend === "supabase" || backend === "neon") return backend;
  throw new Error("NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND must be supabase or neon");
}

export function getBrowserAuthClient() {
  if (browserClient) return browserClient;

  if (getPublicAuthBackend() === "neon") {
    const auth = createNeonAuthClient("/api/auth", {
      adapter: SupabaseAuthAdapter()
    });
    browserClient = { auth };
    return browserClient;
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  browserClient = createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
  return browserClient;
}
