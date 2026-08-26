import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["node_modules", ".next", "test-results"],
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.{js,jsx,ts,tsx}"],
          exclude: ["node_modules", ".next", "test-results", "src/ui/**/*.test.{js,jsx,ts,tsx}"]
        }
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/ui/**/*.test.{js,jsx,ts,tsx}"]
        }
      }
    ]
  }
});
