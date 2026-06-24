import { test, expect, devices } from "@playwright/test";
import { signInIfPossible } from "./_helpers";

/**
 * Every primary screen must render inside the capped phone shell
 * (≤ 874px tall on desktop viewports) and keep a visible focus ring
 * on the first interactive element when tabbed at both iPhone 16 and
 * iPhone 16 Pro CSS dimensions.
 */

const SCREENS = [
  { name: "onboarding", path: "/onboarding", auth: false },
  { name: "home",       path: "/",           auth: true },
  { name: "morning",    path: "/morning",    auth: true },
  { name: "evening",    path: "/evening",    auth: true },
  { name: "session",    path: "/session",    auth: true },
  { name: "library",    path: "/library",    auth: true },
  { name: "profile",    path: "/profile",    auth: true },
] as const;

const VIEWPORTS = [
  { name: "iphone-16",     width: 393, height: 852 },
  { name: "iphone-16-pro", width: 402, height: 874 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`Height + focus @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const screen of SCREENS) {
      test(`${screen.name} fits capped height and shows focus ring`, async ({ page }) => {
        if (screen.auth) {
          const ok = await signInIfPossible(page);
          test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
        }
        await page.goto(screen.path);

        const shell = page.locator(".phone-shell").first();
        await expect(shell).toBeVisible();
        const box = await shell.boundingBox();
        expect(box, "phone shell must render").not.toBeNull();
        // Capped to iPhone 16 Pro height (874px) — never taller than the viewport.
        expect(box!.height).toBeLessThanOrEqual(vp.height + 1);
        expect(box!.height).toBeLessThanOrEqual(874 + 1);

        // Tab through and confirm the focused element has a visible ring.
        await page.keyboard.press("Tab");
        const focusInfo = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const s = window.getComputedStyle(el);
          const hasRing =
            (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
            s.boxShadow !== "none";
          return { tag: el.tagName, hasRing };
        });
        if (focusInfo) {
          expect(
            focusInfo.hasRing,
            `${screen.name}: first focused ${focusInfo.tag} must show a visible focus ring at ${vp.name}`,
          ).toBe(true);
        }
      });
    }
  });
}