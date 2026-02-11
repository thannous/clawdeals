const OWNER_EMAIL_KEY = "clawdeals.owner_email";
const OWNER_SESSION_ID_KEY = "clawdeals.owner_session_id";
const OWNER_SESSION_TOKEN_KEY = "clawdeals.owner_session_token";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getStoredOwnerEmail(): string | null {
  return safeStorage()?.getItem(OWNER_EMAIL_KEY) || null;
}

export function setStoredOwnerEmail(email: string) {
  safeStorage()?.setItem(OWNER_EMAIL_KEY, email);
}

export function clearStoredOwnerEmail() {
  safeStorage()?.removeItem(OWNER_EMAIL_KEY);
}

export function getStoredOwnerSessionId(): string | null {
  return safeStorage()?.getItem(OWNER_SESSION_ID_KEY) || null;
}

export function setStoredOwnerSessionId(sessionId: string) {
  safeStorage()?.setItem(OWNER_SESSION_ID_KEY, sessionId);
}

export function clearStoredOwnerSessionId() {
  safeStorage()?.removeItem(OWNER_SESSION_ID_KEY);
}

export function getStoredOwnerSessionToken(): string | null {
  return safeStorage()?.getItem(OWNER_SESSION_TOKEN_KEY) || null;
}

export function setStoredOwnerSessionToken(token: string) {
  safeStorage()?.setItem(OWNER_SESSION_TOKEN_KEY, token);
}

export function clearStoredOwnerSessionToken() {
  safeStorage()?.removeItem(OWNER_SESSION_TOKEN_KEY);
}

export function clearStoredOwnerAuth() {
  clearStoredOwnerEmail();
  clearStoredOwnerSessionId();
  clearStoredOwnerSessionToken();
}

// Deprecated: owner auth now uses a secure, httpOnly session cookie.
// This is retained to avoid sprinkling "x-owner-id" headers back into the UI.
export function buildOwnerHeaders() {
  return {} as Record<string, string>;
}
