import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";

// URL comes only from validated server configuration, never a JWT jku/x5u claim.
const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function verifyNeonAccessToken(token: string, baseUrl: string, subject: string): Promise<boolean> {
  const issuer = process.env.NEON_AUTH_JWT_ISSUER?.trim();
  const audience = process.env.NEON_AUTH_JWT_AUDIENCE?.trim();
  // Fail closed: no opaque bearer fallback or inferred issuer/audience.
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL?.trim();
  if (!issuer || !audience || !jwksUrl || token.split(".").length !== 3) return false;
  try {
    const url = new URL(jwksUrl);
    if (url.protocol !== "https:" || url.origin !== new URL(baseUrl).origin || url.username || url.password || url.search || url.hash) return false;
    let keys = keysets.get(jwksUrl);
    if (!keys) {
      keys = createRemoteJWKSet(url, {
        timeoutDuration: 5000, cooldownDuration: 30_000, cacheMaxAge: 300_000,
        [customFetch]: (url, options) => fetch(url, { ...options, redirect: "error" })
      });
      // Bound process cache independently of configuration churn.
      if (keysets.size >= 4) keysets.clear();
      keysets.set(jwksUrl, keys);
    }
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["EdDSA"], issuer, audience, subject,
      requiredClaims: ["sub", "iss", "aud", "exp", "iat"], clockTolerance: 0
    });
    return typeof payload.iat === "number" && payload.iat <= Math.floor(Date.now() / 1000);
  } catch { return false; }
}
