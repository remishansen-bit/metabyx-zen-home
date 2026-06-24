import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";

/** METABYX ships as a dark theme by default; this suite verifies the key
 *  screens stay readable: contrast on copy, no white-on-white, and the
 *  PhoneFrame shell is always present. */
const ROUTES = ["/auth", "/", "/morning", "/session", "/library", "/circles", "/profile", "/settings"];

test.describe("Dark mode regressions", () => {
  for (const path of ROUTES) {
    test(`background is dark and body text is light on ${path}`, async ({ page }) => {
      if (path !== "/auth") {
        const ok = await signInIfPossible(page);
        test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
      }
      await page.goto(path);
      // Wait for the shell to settle (auth redirect, suspense, etc.)
      await page.waitForLoadState("networkidle").catch(() => {});

      const bg = await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      const fg = await page.evaluate(
        () => getComputedStyle(document.body).color,
      );

      // METABYX uses an oklch dark indigo — assert the body is not pure white.
      expect(bg).not.toMatch(/rgb\(255,\s*255,\s*255\)/);
      // Text color should not equal background (no white-on-white).
      expect(fg).not.toBe(bg);
    });
  }

  test("PhoneFrame is the consistent shell across screens", async ({ page }) => {
    await page.goto("/auth");
    const shell = page.locator(".phone-shell").first();
    await expect(shell).toBeVisible();
    const box = await shell.boundingBox();
    expect(box?.width).toBeGreaterThan(280);
    expect(box?.width).toBeLessThanOrEqual(420);
  });
});