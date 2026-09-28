export const PRODUCTION_SUPABASE_REF = "gztfmpuqtpvncdcuhqxy";
const PRODUCTION_API_HOSTS = new Set([
  "clawdeals.com",
  "www.clawdeals.com",
  "app.clawdeals.com"
]);
const DEFAULT_SUPABASE_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"];
const DEFAULT_API_KEYS = ["API_BASE_URL", "E2E_BASE_URL", "SMOKE_BASE_URL", "CLAWDEALS_API_BASE"];

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseUrl(raw) {
  const input = normalizeString(raw);
  if (!input) return null;

  try {
    return new URL(input);
  } catch {
    try {
      return new URL(`https://${input}`);
    } catch {
      return null;
    }
  }
}

export function extractSupabaseRef(value) {
  const parsed = parseUrl(value);
  const host = parsed?.hostname?.toLowerCase();
  if (!host) return null;

  const hostMatch = host.match(/^([a-z0-9]{20})\.supabase\.co$/i);
  if (hostMatch?.[1]) return hostMatch[1].toLowerCase();

  const dbMatch = host.match(/^db\.([a-z0-9]{20})\.supabase\.co$/i);
  if (dbMatch?.[1]) return dbMatch[1].toLowerCase();

  return null;
}

export function isProductionSupabaseTarget(value) {
  return extractSupabaseRef(value) === PRODUCTION_SUPABASE_REF;
}

export function isProductionApiTarget(value) {
  const parsed = parseUrl(value);
  const host = parsed?.hostname?.toLowerCase();
  if (!host) return false;
  return PRODUCTION_API_HOSTS.has(host);
}

function buildFailureMessage({
  context,
  offendingSupabase = [],
  offendingApi = []
}) {
  const lines = [
    `[guardrail] Refusing to run ${context || "test tooling"} against production.`,
    `[guardrail] Production Supabase ref is ${PRODUCTION_SUPABASE_REF}.`
  ];

  if (offendingSupabase.length > 0) {
    lines.push(`[guardrail] Production Supabase target(s): ${offendingSupabase.join(", ")}`);
  }

  if (offendingApi.length > 0) {
    lines.push(`[guardrail] Production API target(s): ${offendingApi.join(", ")}`);
  }

  lines.push("[guardrail] Use local credentials, or the documented ClawDeals disposable-production test opt-in for supported test commands.");
  return lines.join("\n");
}

export function assertNonProdTarget({
  context = "",
  supabaseTargets = [],
  apiTargets = []
} = {}) {
  const offendingSupabase = supabaseTargets.filter((entry) => isProductionSupabaseTarget(entry.value)).map((entry) => entry.label);
  const offendingApi = apiTargets.filter((entry) => isProductionApiTarget(entry.value)).map((entry) => entry.label);

  if (offendingSupabase.length === 0 && offendingApi.length === 0) {
    return;
  }

  throw new Error(buildFailureMessage({ context, offendingSupabase, offendingApi }));
}

export function assertNonProdFromEnv(
  envInput,
  {
    context = "",
    allowDisposableProduction = false,
    supabaseKeys = DEFAULT_SUPABASE_KEYS,
    apiKeys = DEFAULT_API_KEYS
  } = {}
) {
  const env = envInput || process.env;
  const supabaseTargets = supabaseKeys.map((key) => ({ label: key, value: env?.[key] }));
  const apiTargets = apiKeys.map((key) => ({ label: key, value: env?.[key] }));
  // Explicitly enabled only by test entrypoints. Exporters, cleanup and sandbox
  // fixture endpoints retain their own strict guards.
  if (
    allowDisposableProduction &&
    env.CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS === PRODUCTION_SUPABASE_REF &&
    env.VERCEL !== "1"
  ) {
    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    const permitted = (entry, database) => {
      if (!normalizeString(entry.value)) return true;
      const url = parseUrl(entry.value);
      if (!url || url.username || url.password) return false;
      if (localHosts.has(url.hostname)) return url.protocol === "http:" || url.protocol === "https:";
      return url.protocol === "https:" && (database
        ? isProductionSupabaseTarget(entry.value)
        : PRODUCTION_API_HOSTS.has(url.hostname));
    };
    if (!supabaseTargets.every((entry) => permitted(entry, true)) ||
        !apiTargets.every((entry) => permitted(entry, false))) {
      throw new Error("[guardrail] Disposable-production tests must target only the ClawDeals project or local services.");
    }
    return;
  }
  assertNonProdTarget({ context, supabaseTargets, apiTargets });
}

export const _internal = {
  parseUrl,
  PRODUCTION_SUPABASE_REF,
  PRODUCTION_API_HOSTS
};
