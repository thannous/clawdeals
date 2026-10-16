import dotenv from "dotenv";
import { execute } from "./run.mjs";

dotenv.config({ path: ".env.testerarmy.local", quiet: true });
dotenv.config({ path: ".env.local", quiet: true });

const origin = "https://app.clawdeals.com";
if (process.env.E2E_BASE_URL && process.env.E2E_BASE_URL !== origin) {
  throw new Error("Connected production commerce only targets https://app.clawdeals.com.");
}
if (process.env.CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS !== "gztfmpuqtpvncdcuhqxy" || process.env.VERCEL === "1") {
  throw new Error("Connected production commerce requires the local ClawDeals disposable-production opt-in.");
}

function remoteHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

// Existing local development may point UPSTASH_* at a mock. The Vercel KV
// aliases retain the configured production pair; resolve only in this process.
const redis = remoteHttps(process.env.UPSTASH_REDIS_REST_URL)
  ? [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN]
  : [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN];
if (!remoteHttps(redis[0]) || !redis[1]) {
  throw new Error("Connected production commerce requires configured remote Redis credentials.");
}
Object.assign(process.env, {
  E2E_BASE_URL: origin,
  TESTERARMY_AI: "0",
  TESTERARMY_HISTORICAL: "0",
  TESTERARMY_PRODUCTION_PUBLIC: "0",
  TESTERARMY_MISSION_LIVE: "0",
  TESTERARMY_COMMERCE_LIVE: "1",
  TESTERARMY_COMMERCE_PRODUCTION: "1",
  TESTERARMY_REDIS_FIXTURE: "production-real",
  UPSTASH_REDIS_REST_URL: redis[0],
  UPSTASH_REDIS_REST_TOKEN: redis[1]
});
await execute();
