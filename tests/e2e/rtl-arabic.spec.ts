import { test, expect } from "@playwright/test";

/**
 * RTL verification — switching to Arabic must flip the document direction,
 * keep the tab bar usable, and surface translated labels on every
 * primary surface (Home + Settings). We seed localStorage with the
 * i18next language key before navigating so we land on the page in
 * Arabic from the very first paint.
 */

const ARABIC_NAV_LABELS = [
  "الرئيسية", // home
  "تسجيل", // check-in
  "موجَّه", // guided
  "الدوائر", // circles
  "المكتبة", // library
  "الملف", // profile
];

test.describe("Arabic RTL layout", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem("metabyx.lang", "ar");
    });
  });

  test("home renders RTL with translated tab bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 10_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    const tabBar = page.locator("nav").first();
    for (const label of ARABIC_NAV_LABELS) {
      await expect(tabBar).toContainText(label);
    }

    // Tab bar tracks the right edge in RTL.
    const dir = await page.evaluate(() => getComputedStyle(document.documentElement).direction);
    expect(dir).toBe("rtl");
  });

  test("settings (or auth gate) renders RTL with Arabic copy", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 10_000 });

    // Either Settings (authed) or Auth gate (unauthed) — both ship Arabic.
    // We assert at least one Arabic letter renders on the page (no fallback
    // to English-only copy) and that the tab bar, when present, is in Arabic.
    const body = page.locator("body");
    await expect(body).toHaveText(/[\u0600-\u06FF]/);

    const tabBar = page.locator("nav").first();
    if (await tabBar.count()) {
      await expect(tabBar).toContainText("الرئيسية");
    }
  });
});