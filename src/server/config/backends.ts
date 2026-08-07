export type DatabaseBackend = "supabase" | "neon";
export type AuthBackend = "supabase" | "neon";
export type ObjectStorageBackend = "supabase" | "vercel-blob";

function readBackend<T extends string>(
  envName: string,
  allowed: readonly T[],
  fallback: T
): T {
  const raw = process.env[envName];
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;

  throw new Error(
    `Env var ${envName} must be one of: ${allowed.join(", ")}`
  );
}

export function getDatabaseBackend(): DatabaseBackend {
  return readBackend("CLAWDEALS_DATABASE_BACKEND", ["supabase", "neon"], "supabase");
}

export function getAuthBackend(): AuthBackend {
  return readBackend("CLAWDEALS_AUTH_BACKEND", ["supabase", "neon"], "supabase");
}

export function getObjectStorageBackend(): ObjectStorageBackend {
  return readBackend(
    "CLAWDEALS_OBJECT_STORAGE_BACKEND",
    ["supabase", "vercel-blob"],
    "supabase"
  );
}

function getScopedObjectStorageBackend(envName: string): ObjectStorageBackend {
  const fallback = getObjectStorageBackend();
  return readBackend(envName, ["supabase", "vercel-blob"], fallback);
}

export function getListingStorageBackend(): ObjectStorageBackend {
  return getScopedObjectStorageBackend("CLAWDEALS_LISTING_STORAGE_BACKEND");
}

export function getEvidenceStorageBackend(): ObjectStorageBackend {
  return getScopedObjectStorageBackend("CLAWDEALS_EVIDENCE_STORAGE_BACKEND");
}
