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
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]]
    : [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 402, height: 874 }, // iPhone 16 Pro
    // Always retain traces, screenshots, and videos on failure so the CI
    // artifact bundle is immediately diagnosable for queued-replay / a11y issues.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "iphone-16",
      use: { ...devices["iPhone 15"], viewport: { width: 393, height: 852 } },
    },
    {
      name: "iphone-16-pro",
      use: { ...devices["iPhone 15 Pro"], viewport: { width: 402, height: 874 } },
    },
  ],
});