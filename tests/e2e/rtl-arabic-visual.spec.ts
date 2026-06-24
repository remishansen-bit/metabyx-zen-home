import { test, expect } from "@playwright/test";

/**
 * RTL visual snapshots — guard against alignment, spacing, and component
 * placement regressions on the two primary surfaces (Home + Settings)
 * when the app is rendered in Arabic (RTL).
 *
 * Update baselines with:
 *   bun run e2e:update-snapshots -- rtl-arabic-visual
 */
test.describe("Arabic RTL visual snapshots", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem("metabyx.lang", "ar");
    });
  });

  test("home in Arabic matches baseline", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 10_000 });
    // Give any entrance animations a beat to settle so the snapshot is stable.
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot("home-ar.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    });
  });

  test("settings in Arabic matches baseline", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 10_000 });
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot("settings-ar.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    });
  });
});