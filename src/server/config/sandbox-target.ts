import {
  extractSupabaseRef,
  isProductionSupabaseTarget,
  PRODUCTION_SUPABASE_REF
} from "../../../scripts/lib/assert-non-prod-target.mjs";

import { isSandboxEnv } from "./runtime";

const SANDBOX_SUPABASE_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;

function buildGuardError(message: string, details?: Record<string, unknown>) {
  const error: any = new Error(message);
  error.status = 403;
  error.code = "PRODUCTION_TARGET_FORBIDDEN";
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function parseHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`https://${value}`).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
}

function isLocalSupabaseTarget(value: string) {
  const host = parseHost(value);
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "host.docker.internal";
}

export function isAllowedSandboxSupabaseTarget(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return false;
  if (isProductionSupabaseTarget(raw)) return false;
  if (extractSupabaseRef(raw)) return true;
  return isLocalSupabaseTarget(raw);
}

export function assertSandboxNotProductionTarget(env: NodeJS.ProcessEnv = process.env) {
  if (!isSandboxEnv(env)) {
    return;
  }

  const inspected = SANDBOX_SUPABASE_KEYS.map((key) => ({
    key,
    value: typeof env[key] === "string" ? env[key].trim() : ""
  }));
  const missing = inspected.filter((entry) => !entry.value).map((entry) => entry.key);
  if (missing.length > 0) {
    throw buildGuardError(
      "Sandbox reset/fixture operations require an explicit non-production Supabase URL",
      { missing, productionRef: PRODUCTION_SUPABASE_REF }
    );
  }

  const production = inspected
    .filter((entry) => isProductionSupabaseTarget(entry.value))
    .map((entry) => entry.key);
  if (production.length > 0) {
    throw buildGuardError(
      "Sandbox reset/fixture operations cannot target the production Supabase project",
      { production, productionRef: PRODUCTION_SUPABASE_REF }
    );
  }

  const unknown = inspected
    .filter((entry) => !isAllowedSandboxSupabaseTarget(entry.value))
    .map((entry) => entry.key);
  if (unknown.length > 0) {
    throw buildGuardError(
      "Sandbox reset/fixture operations cannot target an unverified Supabase URL",
      { unknown, productionRef: PRODUCTION_SUPABASE_REF }
    );
  }
}
