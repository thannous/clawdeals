export type ClawdealsEnv = "production" | "development" | "test" | "sandbox";

function isClawdealsEnv(value: unknown): value is ClawdealsEnv {
  return value === "production" || value === "development" || value === "test" || value === "sandbox";
}

export function getClawdealsEnv(env: NodeJS.ProcessEnv = process.env): ClawdealsEnv {
  const explicit = env.CLAWDEALS_ENV;
  if (isClawdealsEnv(explicit)) {
    return explicit;
  }

  const nodeEnv = env.NODE_ENV;
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  return "development";
}

export function isSandboxEnv(env: NodeJS.ProcessEnv = process.env) {
  return getClawdealsEnv(env) === "sandbox";
}

