const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev -- --port 3001",
    port: 3001,
    reuseExistingServer: false
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
