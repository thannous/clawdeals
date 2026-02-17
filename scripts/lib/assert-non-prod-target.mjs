const PRODUCTION_SUPABASE_REF = "gztfmpuqtpvncdcuhqxy";
const PRODUCTION_API_HOSTS = new Set(["app.clawdeals.com"]);
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

  lines.push("[guardrail] Use staging/local credentials and endpoints before retrying.");
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
    supabaseKeys = DEFAULT_SUPABASE_KEYS,
    apiKeys = DEFAULT_API_KEYS
  } = {}
) {
  const env = envInput || process.env;
  const supabaseTargets = supabaseKeys.map((key) => ({ label: key, value: env?.[key] }));
  const apiTargets = apiKeys.map((key) => ({ label: key, value: env?.[key] }));
  assertNonProdTarget({ context, supabaseTargets, apiTargets });
}

export const _internal = {
  parseUrl,
  PRODUCTION_SUPABASE_REF,
  PRODUCTION_API_HOSTS
};
