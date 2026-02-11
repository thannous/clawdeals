import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

let dotenvLoaded = false;

export function loadDotenvOnce() {
  if (dotenvLoaded) return;
  dotenvLoaded = true;

  // Playwright config already loads `.env.local`, but keep this fallback so
  // integration specs can be run directly if needed.
  const envCandidates = [
    path.resolve(__dirname, "..", "..", "..", ".env.local"),
    path.resolve(process.cwd(), ".env.local")
  ];

  const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
  if (!envPath) return;

  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function assertIntegrationEnv() {
  loadDotenvOnce();

  const requiredEnv = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "IDEMPOTENCY_SECRET",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN"
  ] as const;

  const missingEnv = requiredEnv.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    throw new Error(`Missing env vars for integration tests: ${missingEnv.join(", ")}`);
  }
}

export const skipRateLimitTests = process.env.PW_WEB_SERVER_MODE !== "prod" && process.env.NODE_ENV !== "production";

export function getApiBaseUrl() {
  loadDotenvOnce();
  return process.env.API_BASE_URL || "http://localhost:3000";
}
