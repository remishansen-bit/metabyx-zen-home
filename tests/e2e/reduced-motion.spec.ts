import { test, expect, type Page } from "@playwright/test";

/**
 * prefers-reduced-motion: animations must collapse to ~instant, but layout
 * and focus order must remain intact. This spec drives the user preference
 * ON THE FLY (no static fixture) and re-measures across all key routes so
 * we catch regressions where a new screen ships an animation outside the
 * global reduce-motion cap in src/styles.css.
 */

const ROUTES = ["/", "/onboarding", "/auth", "/library", "/morning", "/evening", "/profile", "/session"];

async function maxAnimDuration(page: Page) {
  return page.evaluate(() => {
    let max = 0;
    let worst = "";
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const s = window.getComputedStyle(el);
      const dur = parseFloat(s.animationDuration) || 0;
      const td = parseFloat(s.transitionDuration) || 0;
      const m = Math.max(dur, td);
      if (m > max) {
        max = m;
        worst = `${el.tagName}.${(el.className || "").toString().slice(0, 80)}`;
      }
    }
    return { max, worst };
  });
}

test.describe("prefers-reduced-motion toggled on the fly", () => {
  test.use({ colorScheme: "dark" });

  for (const path of ROUTES) {
    test(`${path}: toggling reduced-motion collapses ScreenTransition animations`, async ({ page, context }) => {
      // Start with motion ENABLED — baseline.
      await context.clearCookies();
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      // Don't assert baseline durations strictly — some routes may have no
      // animated nodes mounted yet. We only care that AFTER toggling
      // reduce-motion, every node respects the global cap.

      // Now toggle to reduce — without reloading. The @media query is
      // re-evaluated live and styles.css collapses all animation/transition
      // durations to 0.001ms.
      await page.emulateMedia({ reducedMotion: "reduce" });
      // One animation frame for the media-query change to propagate.
      await page.waitForTimeout(50);

      const after = await maxAnimDuration(page);
      expect(
        after.max,
        `reduced-motion should clamp animations on ${path}; worst offender: ${after.worst}`,
      ).toBeLessThanOrEqual(0.05);

      // Layout still renders and focus order still advances.
      const shell = page.locator(".phone-shell").first();
      if (await shell.count()) await expect(shell).toBeVisible();
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => document.activeElement?.tagName ?? null);
      expect(focused).not.toBeNull();
      expect(focused).not.toBe("BODY");
    });
  }
});