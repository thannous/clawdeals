import crypto from "node:crypto";

import { getAuthBackend } from "../config/backends";
import { getSupabaseServiceClient } from "../db/supabase";

export type ExternalAuthIdentity = {
  provider: "supabase" | "neon";
  subject: string;
  email: string | null;
  emailVerifiedAt: string | null;
  upstreamProvider: string | null;
};

function normalizeNonEmptyString(value: unknown) {
  if (value === null || value === undefined) return null;
  const resolved = String(value).trim();
  return resolved || null;
}

function parseIsoDate(value: unknown) {
  const raw = normalizeNonEmptyString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function resolveSupabaseEmailVerifiedAt(user: any) {
  const direct = parseIsoDate(user?.email_confirmed_at) || parseIsoDate(user?.confirmed_at);
  if (direct) return direct;
  if (user?.user_metadata?.email_verified === true) return new Date().toISOString();

  const identities = Array.isArray(user?.identities) ? user.identities : [];
  return identities.some((identity: any) => identity?.identity_data?.email_verified === true)
    ? new Date().toISOString()
    : null;
}

function resolveSupabaseProvider(user: any) {
  const provider = normalizeNonEmptyString(user?.app_metadata?.provider);
  if (provider) return provider.toLowerCase();
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  return normalizeNonEmptyString(identities[0]?.provider)?.toLowerCase() || null;
}

function tokensMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getNeonAuthCookies(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith("__Secure-neon-auth."))
    .join("; ");
}

async function verifySupabaseIdentity(accessToken: string): Promise<ExternalAuthIdentity | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  const subject = normalizeNonEmptyString(data.user.id);
  if (!subject) return null;
  return {
    provider: "supabase",
    subject,
    email: normalizeNonEmptyString(data.user.email)?.toLowerCase() || null,
    emailVerifiedAt: resolveSupabaseEmailVerifiedAt(data.user),
    upstreamProvider: resolveSupabaseProvider(data.user)
  };
}

async function verifyNeonIdentity(
  accessToken: string,
  cookieHeader: string | null
): Promise<ExternalAuthIdentity | null> {
  const baseUrl = normalizeNonEmptyString(process.env.NEON_AUTH_BASE_URL);
  if (!baseUrl) throw new Error("Missing required env var: NEON_AUTH_BASE_URL");
  if (!cookieHeader) return null;
  const neonCookies = getNeonAuthCookies(cookieHeader);
  if (!neonCookies) return null;

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/get-session`, {
    method: "GET",
    headers: {
      accept: "application/json",
      cookie: neonCookies
    },
    cache: "no-store"
  });
  if (!response.ok) return null;

  const payload: any = await response.json();
  const resolved = payload?.data || payload;
  const session = resolved?.session;
  const user = resolved?.user;
  const sessionToken = normalizeNonEmptyString(session?.token);
  const subject = normalizeNonEmptyString(user?.id);
  if (!sessionToken || !tokensMatch(accessToken, sessionToken) || !subject) return null;

  return {
    provider: "neon",
    subject,
    email: normalizeNonEmptyString(user?.email)?.toLowerCase() || null,
    emailVerifiedAt: user?.emailVerified === true ? new Date().toISOString() : null,
    upstreamProvider: "neon"
  };
}

export async function verifyExternalAuthIdentity({
  accessToken,
  cookieHeader = null
}: {
  accessToken: string;
  cookieHeader?: string | null;
}): Promise<ExternalAuthIdentity | null> {
  if (getAuthBackend() === "neon") {
    return verifyNeonIdentity(accessToken, cookieHeader);
  }
  return verifySupabaseIdentity(accessToken);
}
