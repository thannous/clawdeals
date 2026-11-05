import { assertRehearsalEffectAllowed } from "../config/rehearsal";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { validateNeonAuthConfiguration } from "./neon-auth-config";

let neonAuth: ReturnType<typeof createNeonAuth> | null = null;

export function getNeonAuth() {
  assertRehearsalEffectAllowed("auth/neon-auth");
  if (neonAuth) return neonAuth;

  const { baseUrl, secret } = validateNeonAuthConfiguration();
  neonAuth = createNeonAuth({
    baseUrl: baseUrl,
    cookies: {
      secret: secret,
      sessionDataTtl: 300
    },
    logLevel: process.env.NODE_ENV === "test" ? "silent" : "warn"
  });
  return neonAuth;
}
