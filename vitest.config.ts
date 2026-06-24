import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/** Keep Playwright E2E specs out of the Vitest run — they target a live
 *  browser via @playwright/test, not the jsdom unit runner. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", "tests/e2e/**", ".nitro/**"],
  },
});