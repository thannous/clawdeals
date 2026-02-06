import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

dotenv.config({ path: ".env.local" });

const devPort = Number(process.env.E2E_DEV_PORT || 3000);
const uiBaseURL = process.env.E2E_BASE_URL || `http://localhost:${devPort}`;
// Integration can optionally target a different server than UI.
const integrationBaseURL = process.env.API_BASE_URL || uiBaseURL;
// Only skip starting the dev server when explicitly told to.
const useExistingServer = Boolean(process.env.E2E_BASE_URL);

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
        command: `npm run dev -- --port ${devPort}`,
        url: uiBaseURL,
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
      workers: 1,
      use: { ...devices["Desktop Chrome"], baseURL: integrationBaseURL }
    }
  ]
});
