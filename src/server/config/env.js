export function getEnv(name, options = {}) {
  const value = process.env[name];
  if (value !== undefined && value !== "") return value;
  if (options.defaultValue !== undefined) return options.defaultValue;
  if (options.required) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return undefined;
}

export function getNumberEnv(name, options = {}) {
  const raw = getEnv(name, options);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) throw new Error(`Env var ${name} must be a number`);
  return parsed;
}
