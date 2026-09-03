export type AgentRole = "buyer" | "seller";

export type RoleKeys = Partial<Record<AgentRole, string>>;

// Session-scoped on purpose: judge keys are synthetic, but they should not outlive the tab.
const ROLE_KEYS_STORAGE_KEY = "clawdeals_webmcp_role_keys";
const ROLE_KEYS_CHANGE_EVENT = "clawdeals:webmcp-role-keys-change";

export const AGENT_ROLES: AgentRole[] = ["buyer", "seller"];

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ROLE_KEYS_CHANGE_EVENT));
}

const EMPTY_ROLE_KEYS: RoleKeys = Object.freeze({});
// useSyncExternalStore requires a stable snapshot for unchanged storage, so cache by raw value.
let cachedRaw: string | null = null;
let cachedKeys: RoleKeys = EMPTY_ROLE_KEYS;

function parseRoleKeys(raw: string | null): RoleKeys {
  if (!raw) return EMPTY_ROLE_KEYS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_ROLE_KEYS;
    const out: RoleKeys = {};
    for (const role of AGENT_ROLES) {
      if (typeof parsed[role] === "string" && parsed[role]) out[role] = parsed[role];
    }
    return out;
  } catch {
    return EMPTY_ROLE_KEYS;
  }
}

export function getRoleKeys(): RoleKeys {
  const storage = safeSessionStorage();
  if (!storage) return EMPTY_ROLE_KEYS;
  let raw: string | null = null;
  try {
    raw = storage.getItem(ROLE_KEYS_STORAGE_KEY);
  } catch {
    return EMPTY_ROLE_KEYS;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedKeys = parseRoleKeys(raw);
  }
  return cachedKeys;
}

export function setRoleKey(role: AgentRole, apiKey: string) {
  const storage = safeSessionStorage();
  if (!storage || !apiKey) return;
  const next = { ...getRoleKeys(), [role]: apiKey };
  try {
    storage.setItem(ROLE_KEYS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  emit();
}

export function clearRoleKeys() {
  const storage = safeSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(ROLE_KEYS_STORAGE_KEY);
  } catch {
    return;
  }
  emit();
}

export function subscribeRoleKeys(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(ROLE_KEYS_CHANGE_EVENT, listener);
  return () => window.removeEventListener(ROLE_KEYS_CHANGE_EVENT, listener);
}

export function roleForKey(apiKey: string | null, roleKeys: RoleKeys): AgentRole | null {
  if (!apiKey) return null;
  for (const role of AGENT_ROLES) if (roleKeys[role] === apiKey) return role;
  return null;
}

export function otherRole(role: AgentRole): AgentRole {
  return role === "buyer" ? "seller" : "buyer";
}
