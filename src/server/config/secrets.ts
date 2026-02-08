export function resolveSecretRef(ref: string) {
  if (!ref || typeof ref !== "string") {
    throw new Error("Secret ref is required");
  }

  const trimmed = ref.trim();
  if (!trimmed) {
    throw new Error("Secret ref is required");
  }

  if (!trimmed.startsWith("env:")) {
    throw new Error("Unsupported secret ref (expected env:VAR_NAME)");
  }

  const name = trimmed.slice("env:".length).trim();
  if (!name) {
    throw new Error("Invalid secret ref (missing env var name)");
  }

  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var for secret ref: ${name}`);
  }

  return value;
}

