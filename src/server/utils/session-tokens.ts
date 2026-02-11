import crypto from "node:crypto";

const OWNER_SESSION_TOKEN_PREFIX = "cd_os_";
// base64url(32 bytes) => 43 chars.
const OWNER_SESSION_TOKEN_SUFFIX_LEN = 43;
const OWNER_SESSION_TOKEN_RE = new RegExp(`^${OWNER_SESSION_TOKEN_PREFIX}[A-Za-z0-9_-]{${OWNER_SESSION_TOKEN_SUFFIX_LEN}}$`);

function buildServiceError(message: string, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function requireOwnerSessionSecret() {
  const secret =
    process.env.OWNER_SESSION_SECRET ||
    process.env.OWNER_SESSIONS_SECRET ||
    process.env.OAUTH_TOKEN_SECRET ||
    process.env.CONNECT_SESSION_SECRET ||
    process.env.CONNECT_SESSIONS_SECRET ||
    process.env.PAIR_TOKEN_SECRET ||
    process.env.PAIRING_CODE_SECRET;

  if (!secret) {
    throw buildServiceError(
      "OWNER_SESSION_SECRET (or OWNER_SESSIONS_SECRET/OAUTH_TOKEN_SECRET/CONNECT_SESSION_SECRET/CONNECT_SESSIONS_SECRET/PAIR_TOKEN_SECRET/PAIRING_CODE_SECRET) is required",
      500,
      "MISSING_SECRET"
    );
  }

  return secret;
}

export function generateOwnerSessionToken() {
  // base64url(32 bytes) => 43 chars + prefix. High-entropy and URL-safe.
  return `${OWNER_SESSION_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

export function isOwnerSessionToken(token: any) {
  if (typeof token !== "string") return false;
  // Avoid hashing/DB work for obviously-invalid tokens and prevent pathological input sizes.
  if (token.length !== OWNER_SESSION_TOKEN_PREFIX.length + OWNER_SESSION_TOKEN_SUFFIX_LEN) return false;
  return OWNER_SESSION_TOKEN_RE.test(token);
}

export function hashOwnerSessionToken(token: string, secret?: string) {
  const resolvedSecret = secret || requireOwnerSessionSecret();
  return crypto.createHmac("sha256", resolvedSecret).update(String(token)).digest("hex");
}
