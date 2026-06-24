import { test, expect } from "@playwright/test";

/**
 * Screenshot comparisons for layout-shift and readability regressions.
 * Run `bun run e2e:update-snapshots` once after intentional UI changes.
 *
 * We freeze animations to keep diffs stable. The auth screen is captured
 * unauthenticated; gated screens fall back to redirect targets but still
 * give us a useful shell screenshot.
 */

const FREEZE_ANIMATIONS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

const screens = [
  { name: "auth", path: "/auth" },
  { name: "onboarding", path: "/onboarding" },
] as const;

for (const screen of screens) {
  test(`visual: ${screen.name}`, async ({ page }) => {
    await page.addStyleTag({ content: FREEZE_ANIMATIONS }).catch(() => {});
    await page.goto(screen.path, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: FREEZE_ANIMATIONS });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot(`${screen.name}.png`, {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    });
  });
}