import { getAuthBackend } from "../config/backends";

export function getNeonAuthBaseUrl() {
  const raw = process.env.NEON_AUTH_BASE_URL?.trim();
  if (!raw) throw new Error("Missing required env var: NEON_AUTH_BASE_URL");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("NEON_AUTH_BASE_URL must be HTTPS without credentials, query or fragment");
  }
  return url.toString().replace(/\/+$/, "");
}

export function validateNeonAuthConfiguration() {
  if (getAuthBackend() !== "neon" || process.env.NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND !== "neon") {
    throw new Error("Neon Auth requires matching server and browser selectors");
  }
  const baseUrl = getNeonAuthBaseUrl();
  const secret = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("NEON_AUTH_COOKIE_SECRET must contain at least 32 characters");
  return { baseUrl, secret };
}
