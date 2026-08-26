import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

const integrationProject = baseConfig.projects?.find((project) => project.name === "integration");
if (!integrationProject) {
  throw new Error("The integration Playwright project is required for hackathon capture.");
}

export default defineConfig({
  ...(baseConfig as PlaywrightTestConfig),
  testDir: "./e2e/capture",
  testMatch: "**/*.capture.ts",
  outputDir: "test-results/hackathon-video/playwright",
  timeout: 6 * 60 * 1000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["line"]],
  projects: [
    {
      ...integrationProject,
      name: "hackathon-video",
      testDir: "./e2e/capture",
      testMatch: "**/*.capture.ts",
      timeout: 6 * 60 * 1000,
      use: {
        ...integrationProject.use,
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        colorScheme: "dark"
      }
    }
  ]
});
