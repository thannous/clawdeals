require("dotenv").config({ path: ".env.local" });
const { defineConfig, devices } = require("@playwright/test");

const baseURL = process.env.API_BASE_URL || "http://localhost:3001";
const useExistingServer = Boolean(process.env.API_BASE_URL);

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: useExistingServer
    ? undefined
    : {
        command: "npm run dev -- --port 3001",
        port: 3001,
        reuseExistingServer: true
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
