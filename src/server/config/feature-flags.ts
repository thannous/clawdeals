const TRUTHY = new Set(["1", "true", "yes", "on"]);

function toFlagEnvKey(name) {
  return `FEATURE_${String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")}`;
}

export function isFeatureEnabled(name, env = process.env) {
  if (!name) return false;
  const envKey = toFlagEnvKey(name);
  const raw = env[envKey] ?? env[name];
  if (raw === undefined || raw === null) return false;
  return TRUTHY.has(String(raw).trim().toLowerCase());
}

export function getFeatureEnvKey(name) {
  return toFlagEnvKey(name);
}
