import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    include: /\.(js|jsx|ts|tsx)$/
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx,ts,tsx}"],
    exclude: ["node_modules", ".next", "test-results"],
    environmentMatchGlobs: [
      ["src/ui/**/*.test.{js,jsx,ts,tsx}", "jsdom"]
    ]
  }
});
