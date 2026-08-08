import { createNeonAuth } from "@neondatabase/auth/next/server";

let neonAuth: ReturnType<typeof createNeonAuth> | null = null;

function requireEnv(name: string, value: string | undefined) {
  if (value && value.trim()) return value.trim();
  throw new Error(`Missing required env var: ${name}`);
}

export function getNeonAuth() {
  if (neonAuth) return neonAuth;

  neonAuth = createNeonAuth({
    baseUrl: requireEnv("NEON_AUTH_BASE_URL", process.env.NEON_AUTH_BASE_URL),
    cookies: {
      secret: requireEnv("NEON_AUTH_COOKIE_SECRET", process.env.NEON_AUTH_COOKIE_SECRET),
      sessionDataTtl: 300
    },
    logLevel: process.env.NODE_ENV === "test" ? "silent" : "warn"
  });
  return neonAuth;
}
