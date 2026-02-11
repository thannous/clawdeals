import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

dotenv.config({ path: ".env.local" });

const devPort = Number(process.env.E2E_DEV_PORT || 3000);
const uiBaseURL = process.env.E2E_BASE_URL || `http://localhost:${devPort}`;
// Integration can optionally target a different server than UI.
const integrationBaseURL = process.env.API_BASE_URL || uiBaseURL;
// Only skip starting the dev server when explicitly told to.
const useExistingServer = Boolean(process.env.E2E_BASE_URL);
// Turbopack can be memory-hungry under long API-heavy suites; default to webpack for stability.
const devBundler = process.env.PW_DEV_BUNDLER || "webpack";
const devBundlerFlag = devBundler === "webpack" ? "--webpack" : "--turbo";
const webServerMode = process.env.PW_WEB_SERVER_MODE || "dev";
// Integration tests run the server in "prod" mode; ensure required runtime env is present.
const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME || "clawdeals_bot";
const internalCronSecret = process.env.INTERNAL_CRON_SECRET || "test-cron-secret";
// Enable the WebMCP demo route for UI smoke tests.
const webmcpEnv = "NEXT_PUBLIC_WEBMCP_ENABLED=1";
const webServerCommand =
  webServerMode === "prod"
    ? `${webmcpEnv} INTERNAL_CRON_SECRET=${internalCronSecret} TELEGRAM_BOT_USERNAME=${telegramBotUsername} CONSOLE_OPS_ENABLED=1 OWNER_VERIFICATION_ECHO_TOKEN=true SSE_ALLOW_OWNER_OPS=true npm run build && ${webmcpEnv} INTERNAL_CRON_SECRET=${internalCronSecret} TELEGRAM_BOT_USERNAME=${telegramBotUsername} CONSOLE_OPS_ENABLED=1 OWNER_VERIFICATION_ECHO_TOKEN=true SSE_ALLOW_OWNER_OPS=true npm run start -- -p ${devPort}`
    : `${webmcpEnv} npm run dev -- --port ${devPort} ${devBundlerFlag}`;
const integrationWorkers = (() => {
  const raw = process.env.PW_INTEGRATION_WORKERS;
  if (!raw) return 1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
})();

export default defineConfig({
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: "on-first-retry"
  },
  webServer: useExistingServer
    ? undefined
    : {
        command: webServerCommand,
        url: uiBaseURL,
        // Prod build+start in CI/WSL can exceed 3 minutes; keep startup timeout conservative.
        timeout: 420 * 1000,
        reuseExistingServer: true
      },
  projects: [
    {
      name: "ui",
      testDir: "./e2e/ui",
      timeout: 60 * 1000,
      use: { ...devices["Desktop Chrome"], baseURL: uiBaseURL }
    },
    {
      name: "integration",
      testDir: "./e2e/integration",
      workers: integrationWorkers,
      use: { ...devices["Desktop Chrome"], baseURL: integrationBaseURL }
    }
  ]
});
