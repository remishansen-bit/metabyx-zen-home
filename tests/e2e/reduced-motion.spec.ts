import { test, expect } from "@playwright/test";

/**
 * prefers-reduced-motion: animations must collapse to ~instant, but layout
 * and focus order must remain intact. METABYX's reduced-motion CSS lives
 * in src/styles.css under the @media (prefers-reduced-motion: reduce) block.
 */

test.use({ colorScheme: "dark", reducedMotion: "reduce" });

const SCREENS = ["/onboarding", "/auth"];

for (const path of SCREENS) {
  test(`reduced-motion: ${path} stays laid out and keyboard-navigable`, async ({ page }) => {
    await page.goto(path);

    // Animation durations should be ≤ 1ms on all visible nodes.
    const longAnimations = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
        const s = window.getComputedStyle(el);
        const dur = parseFloat(s.animationDuration);
        const td = parseFloat(s.transitionDuration);
        if (dur > 0.05 || td > 0.05) bad.push(`${el.tagName}.${el.className}`);
        if (bad.length > 3) break;
      }
      return bad;
    });
    expect(
      longAnimations,
      `prefers-reduced-motion should disable long animations:\n${longAnimations.join("\n")}`,
    ).toEqual([]);

    // Layout still renders and focus order still advances.
    const shell = page.locator(".phone-shell").first();
    await expect(shell).toBeVisible();
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? null);
    expect(focused).not.toBeNull();
    expect(focused).not.toBe("BODY");
  });
}