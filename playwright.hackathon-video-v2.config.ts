import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

const integrationProject = baseConfig.projects?.find((project) => project.name === "integration");
if (!integrationProject) {
  throw new Error("The integration Playwright project is required for hackathon capture.");
}

export default defineConfig({
  ...(baseConfig as PlaywrightTestConfig),
  testDir: "./e2e/capture",
  testMatch: "**/demo-video-v2.capture.ts",
  outputDir: "test-results/hackathon-video-v2/playwright",
  timeout: 8 * 60 * 1000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["line"]],
  projects: [
    {
      ...integrationProject,
      name: "hackathon-video-v2",
      testDir: "./e2e/capture",
      testMatch: "**/demo-video-v2.capture.ts",
      timeout: 8 * 60 * 1000,
      use: {
        ...integrationProject.use,
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        colorScheme: "dark"
      }
    }
  ]
});
