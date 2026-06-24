import { defineConfig, devices } from "@playwright/test";

/**
 * METABYX E2E config. Run with:
 *   bunx playwright install chromium   # one-time
 *   bun run e2e
 *
 * The dev server is expected to already be running on port 8080
 * (Vite default). Override with PLAYWRIGHT_BASE_URL.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 390, height: 844 }, // iPhone 15 Pro
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["iPhone 15 Pro"] },
    },
  ],
});