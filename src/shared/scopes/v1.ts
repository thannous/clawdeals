const LEGACY_AGENT_SCOPES = new Set(["agent:read", "agent:write"]);

export const V1_SCOPES_DEFAULT = [
  "watchlists:read",
  "watchlists:write",
  "listings:read",
  "listings:write",
  "threads:read",
  "threads:write",
  "offers:read",
  "offers:write",
  "deals:read",
  "reports:write",
  "notifications:read"
];

export const V1_SCOPES_UPGRADE_ONLY = [
  "contacts:reveal",
  "transactions:write",
  "evidence:read",
  "evidence:write",
  "ratings:write",
  "escrow:*",
  "payout:*",
  "policies:*",
  "approvals:admin",
  "audit:export",
  "trust:override",
  "deals:write"
];

export const V1_SCOPES_ALL = [...V1_SCOPES_DEFAULT, ...V1_SCOPES_UPGRADE_ONLY];

const V1_SCOPE_SET = new Set(V1_SCOPES_ALL);
const V1_SCOPE_INDEX = new Map(V1_SCOPES_ALL.map((scope, idx) => [scope, idx]));

function normalizeScopeString(value: any): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim().toLowerCase();
  return str ? str : null;
}

export function isKnownScope(scope: any): boolean {
  const normalized = normalizeScopeString(scope);
  if (!normalized) return false;
  if (LEGACY_AGENT_SCOPES.has(normalized)) return true;
  return V1_SCOPE_SET.has(normalized);
}

function parseScopesInput(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}

export function sortScopesStable(scopes: string[]): string[] {
  const input = Array.isArray(scopes) ? scopes : [];
  const unique = Array.from(new Set(input.map((s) => normalizeScopeString(s)).filter(Boolean) as string[]));
  return unique.sort((a, b) => {
    const ia = V1_SCOPE_INDEX.get(a);
    const ib = V1_SCOPE_INDEX.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.localeCompare(b);
  });
}

export function normalizeRequestedScopes(value: any): {
  normalized: string[];
  unknown: string[];
  requested: string[];
  usedLegacyAgentScopes: boolean;
} {
  const requestedRaw = parseScopesInput(value);
  const requested = Array.from(
    new Set(requestedRaw.map((s) => normalizeScopeString(s)).filter(Boolean) as string[])
  );

  let usedLegacyAgentScopes = false;
  const unknown: string[] = [];
  const normalizedSet = new Set<string>();

  for (const scope of requested) {
    if (LEGACY_AGENT_SCOPES.has(scope)) {
      usedLegacyAgentScopes = true;
      continue;
    }
    if (!V1_SCOPE_SET.has(scope)) {
      unknown.push(scope);
      continue;
    }
    normalizedSet.add(scope);
  }

  if (usedLegacyAgentScopes) {
    V1_SCOPES_DEFAULT.forEach((scope) => normalizedSet.add(scope));
  }

  const normalized = sortScopesStable(Array.from(normalizedSet));
  return { normalized, unknown: sortScopesStable(unknown), requested: sortScopesStable(requested), usedLegacyAgentScopes };
}

export function diffScopes(current: string[], target: string[]) {
  const currentSet = new Set(sortScopesStable(current));
  const targetSet = new Set(sortScopesStable(target));

  const added: string[] = [];
  for (const s of targetSet) {
    if (!currentSet.has(s)) added.push(s);
  }

  const removed: string[] = [];
  for (const s of currentSet) {
    if (!targetSet.has(s)) removed.push(s);
  }

  return { added: sortScopesStable(added), removed: sortScopesStable(removed) };
}
