import crypto from "crypto";
import bcrypt from "bcryptjs";

const EMAIL_TOKEN_BYTES = 32;
const PHONE_OTP_DIGITS = 6;
const BCRYPT_ROUNDS = 10;

export const OWNER_VERIFICATION = {
  emailExpirySeconds: 24 * 60 * 60,
  phoneExpirySeconds: 10 * 60,
  maxAttempts: 5
};

export function normalizeEmail(email) {
  if (email === null || email === undefined) return null;
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

export function normalizePhoneE164(phone) {
  if (phone === null || phone === undefined) return null;
  if (typeof phone !== "string") return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  return trimmed;
}

export function isE164(phone) {
  if (typeof phone !== "string") return false;
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

export function generateEmailToken() {
  return crypto.randomBytes(EMAIL_TOKEN_BYTES).toString("hex");
}

export function generatePhoneOtp() {
  const max = 10 ** PHONE_OTP_DIGITS;
  const value = crypto.randomInt(0, max);
  return String(value).padStart(PHONE_OTP_DIGITS, "0");
}

export async function hashToken(token) {
  return bcrypt.hash(token, BCRYPT_ROUNDS);
}

export async function verifyTokenHash(token, hash) {
  return bcrypt.compare(token, hash);
}

export function computeExpiryDate(seconds, now = new Date()) {
  return new Date(now.getTime() + seconds * 1000);
}

export function secondsUntil(date, now = new Date()) {
  const target = date instanceof Date ? date : new Date(date);
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / 1000));
}

export function isChallengeExpired(challenge, now = new Date()) {
  if (!challenge?.expires_at) return true;
  const expiry = challenge.expires_at instanceof Date
    ? challenge.expires_at
    : new Date(challenge.expires_at);
  return expiry.getTime() <= now.getTime();
}

export function isChallengeConsumed(challenge) {
  return Boolean(challenge?.consumed_at);
}

export function isChallengeLocked(challenge) {
  if (!challenge) return false;
  const attempts = Number(challenge.attempt_count || 0);
  const maxAttempts = Number(challenge.max_attempts || 0);
  return maxAttempts > 0 && attempts >= maxAttempts;
}

export function evaluateChallenge(challenge, now = new Date()) {
  if (!challenge) {
    return { status: "missing" };
  }
  if (isChallengeConsumed(challenge)) {
    return { status: "consumed" };
  }
  if (isChallengeExpired(challenge, now)) {
    return { status: "expired" };
  }
  if (isChallengeLocked(challenge)) {
    return { status: "locked", retryAfterSeconds: secondsUntil(challenge.expires_at, now) };
  }
  return { status: "active" };
}
