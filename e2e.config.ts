import { desktopEngine, mobileEngine } from "./e2e/testerarmy/web-engines";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import dotenv from "dotenv";
import type { E2EConfig } from "e2e";
import { chatgpt } from "e2e/oauth/chatgpt";
import { assertNonProdFromEnv } from "./scripts/lib/assert-non-prod-target.mjs";

// Shell values win; the test-specific file can override the app's local defaults.
dotenv.config({ path: ".env.testerarmy.local" });
dotenv.config({ path: ".env.local" });

assertNonProdFromEnv(process.env, {
  allowDisposableProduction: true,
  context: "TesterArmy E2E tests",
  supabaseKeys: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  apiKeys: ["API_BASE_URL", "E2E_BASE_URL"]
});

const port = Number(process.env.E2E_DEV_PORT || 4318);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("E2E_DEV_PORT must be a valid TCP port.");
}
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${port}`;
const aiEnabled = process.env.TESTERARMY_AI === "1";
const historical = process.env.TESTERARMY_HISTORICAL === "1";
const appNodeOptions = process.env.E2E_APP_NODE_OPTIONS_PRESENT === undefined
  ? process.env.NODE_OPTIONS
  : process.env.E2E_APP_NODE_OPTIONS_PRESENT === "1" ? process.env.E2E_APP_NODE_OPTIONS : undefined;

function agentModel() {
  const provider = process.env.TESTERARMY_PROVIDER || "chatgpt";
  const model = process.env.TESTERARMY_MODEL;
  if (provider === "chatgpt") {
    return chatgpt(model || "gpt-6-luna");
  }
  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY || !model) {
      throw new Error("TesterArmy OpenAI requires OPENAI_API_KEY and TESTERARMY_MODEL.");
    }
    return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
  }
  if (provider === "openai-compatible") {
    const endpoint = process.env.TESTERARMY_MODEL_BASE_URL;
    if (!endpoint || !model) {
      throw new Error("TesterArmy requires TESTERARMY_MODEL_BASE_URL and TESTERARMY_MODEL.");
    }
    return createOpenAICompatible({
      name: "testerarmy",
      baseURL: endpoint,
      ...(process.env.TESTERARMY_MODEL_API_KEY ? { apiKey: process.env.TESTERARMY_MODEL_API_KEY } : {})
    }).chatModel(model);
  }
  throw new Error("TESTERARMY_PROVIDER must be chatgpt, openai or openai-compatible.");
}

const app = {
  url: baseURL,
  // An explicit URL attaches to a running local app or an authorized hosted target.
  ...(process.env.E2E_BASE_URL ? {} : {
    command: {
      executable: "node",
      args: ["node_modules/next/dist/bin/next", "dev", "--port", String(port), "--hostname", "localhost", "--webpack"],
      env: {
        WATCHPACK_POLLING: "true",
        ...(appNodeOptions === undefined ? {} : { NODE_OPTIONS: appNodeOptions }),
        ...(historical ? { NEXT_PUBLIC_WEBMCP_ENABLED: "1" } : {}),
        // Local browser journeys exercise marketing routes; do not inherit APP_HOST=localhost.
        APP_HOST: "app.clawdeals.com",
        MARKETING_HOSTS: "clawdeals.com,www.clawdeals.com",
        CI: process.env.CI || "",
        CLAWDEALS_ENV: process.env.CLAWDEALS_ENV,
        API_KEY_NAMESPACE: process.env.API_KEY_NAMESPACE,
        SUPABASE_URL: process.env.SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN
      },
      startupTimeout: 180_000,
      log: ".e2e/logs/app.log"
    }
  })
};

export default {
  projectId: "clawdeals-testerarmy",
  tests: aiEnabled
    ? "e2e/testerarmy/**/*.agent.e2e.ts"
    : historical ? "e2e/testerarmy/historical/**/*.e2e.ts"
    : ["e2e/testerarmy/**/*.e2e.ts", "!e2e/testerarmy/**/*.agent.e2e.ts", "!e2e/testerarmy/historical/**/*.e2e.ts"],
  targets: [
    { name: "desktop", engine: desktopEngine, app },
    { name: "mobile", engine: mobileEngine, app }
  ],
  workers: 1,
  ...(aiEnabled ? {} : { retries: 0, cache: "off" as const }),
  timeout: aiEnabled ? 180_000 : 60_000,
  assertionTimeout: 15_000,
  trace: "on",
  output: process.env.PARITY_OUTPUT ?? ".e2e",
  reporters: ["list", "junit", "markdown"],
  ...(aiEnabled ? {
    agents: {
      default: {
        model: agentModel(),
        context: "ClawDeals is an AI agent marketplace. Listings are under /browse; public browsing needs no login.",
        system: "Follow only the requested public browsing goal. Do not sign in, submit forms, contact sellers or perform transactions.",
        maxSteps: 12,
        maxModelCalls: 12
      }
    }
  } : {})
} satisfies E2EConfig;
