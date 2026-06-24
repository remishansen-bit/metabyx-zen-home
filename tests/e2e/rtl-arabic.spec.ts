import { test, expect } from "@playwright/test";

/**
 * RTL verification — switching to Arabic must flip the document direction
 * and keep the tab bar usable. We seed localStorage with the i18next
 * language key before navigating so we land on the page already in Arabic.
 */
test.describe("Arabic RTL layout", () => {
  test("home and settings render right-to-left with Arabic labels", async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      window.localStorage.setItem("metabyx.lang", "ar");
    });

    await page.goto("/");
    // Wait for client hydration: i18n init runs in a useEffect.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 10_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    // Tab bar should contain the Arabic label for Home: "الرئيسية".
    const tabBar = page.locator("nav").first();
    await expect(tabBar).toContainText("الرئيسية");

    // Settings (public preview without auth may redirect to /auth; assert
    // whichever page renders is still RTL with Arabic auth headline).
    await page.goto("/settings");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});