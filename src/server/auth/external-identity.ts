import { getNeonAuthBaseUrl } from "./neon-auth-config";
import { verifyNeonAccessToken } from "./neon-jwt";

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

function resolveSupabaseEmailVerifiedAt(user: any) {
  const email = normalizeNonEmptyString(user?.email)?.toLowerCase();
  if (!email) return null;
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  // Supabase can autoconfirm email/password accounts without mailbox proof.
  // Only a matching Google identity supplies trusted email ownership here.
  return identities.some(
    (identity: any) =>
      identity?.provider === "google" &&
      identity?.identity_data?.email_verified === true &&
      normalizeNonEmptyString(identity?.identity_data?.email)?.toLowerCase() === email
  )
    ? new Date().toISOString()
    : null;
}

function resolveSupabaseProvider(user: any) {
  const provider = normalizeNonEmptyString(user?.app_metadata?.provider);
  if (provider) return provider.toLowerCase();
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  return normalizeNonEmptyString(identities[0]?.provider)?.toLowerCase() || null;
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
  const baseUrl = getNeonAuthBaseUrl();
  if (!cookieHeader) return null;
  const neonCookies = getNeonAuthCookies(cookieHeader);
  if (!neonCookies) return null;

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/get-session`, {
    method: "GET",
    headers: {
      accept: "application/json",
      cookie: neonCookies
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) return null;

  const payload: any = await response.json();
  const resolved = payload?.data || payload;
  const session = resolved?.session;
  const user = resolved?.user;
  const sessionToken = normalizeNonEmptyString(session?.token);
  const subject = normalizeNonEmptyString(user?.id);
  const expiresAt = typeof session?.expiresAt === "string" ? Date.parse(session.expiresAt) : NaN;
  if (!sessionToken || !subject || user?.banned === true || session?.userId !== subject ||
      !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  if (!await verifyNeonAccessToken(accessToken, baseUrl, subject)) return null;

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
