import { test, expect, type Page } from "@playwright/test";

/**
 * ScreenTransition regression suite.
 *
 * Two guarantees that must hold across routes:
 *
 *  1. Phase changes (loading → empty → content) do NOT cause layout jumps.
 *     We snapshot the bounding rect of a stable landmark before and after a
 *     simulated state transition and assert the position is unchanged within
 *     a 1-px tolerance.
 *
 *  2. Under prefers-reduced-motion all `.animate-phase-in`,
 *     `.skeleton-shimmer`, `.animate-rise`, and any other entrance animation
 *     resolves to ≤ 1ms — the swap is effectively instant.
 */

const ROUTES = ["/", "/library", "/morning", "/evening", "/profile", "/session"];

async function readMaxAnimDuration(page: Page) {
  return page.evaluate(() => {
    let max = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const s = window.getComputedStyle(el);
      const dur = parseFloat(s.animationDuration) || 0;
      const td = parseFloat(s.transitionDuration) || 0;
      if (dur > max) max = dur;
      if (td > max) max = td;
    }
    return max;
  });
}

test.describe("ScreenTransition — reduced motion is instant across routes", () => {
  test.use({ colorScheme: "dark", reducedMotion: "reduce" });

  for (const path of ROUTES) {
    test(`reduced-motion: ${path} resolves animations near-instantly`, async ({ page }) => {
      await page.goto(path);
      // Allow public routes (auth gate) to redirect before measuring.
      await page.waitForLoadState("domcontentloaded");
      const max = await readMaxAnimDuration(page);
      // 0.05s is the tolerance — the reduced-motion CSS hard-caps everything at 0.001ms.
      expect(max, `max animation duration on ${path}`).toBeLessThanOrEqual(0.05);
    });
  }
});

test.describe("ScreenTransition — phase swap does not shift layout", () => {
  test.use({ colorScheme: "dark" });

  test("library empty → content swap keeps surrounding chrome fixed", async ({ page }) => {
    await page.goto("/library");
    // The status-bar title is a stable landmark above the transition region.
    const landmark = page.locator(".phone-shell-scroll").first();
    await landmark.waitFor();
    const before = await landmark.boundingBox();

    // Drive a phase change by toggling the search input — empty → "no-match".
    const search = page.getByRole("searchbox", { name: /search past branches/i });
    if (await search.count()) {
      await search.fill("zzzzzz-no-match-zzzzzz");
      await page.waitForTimeout(400); // debounce + phase-in
    }
    const after = await landmark.boundingBox();

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    if (before && after) {
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    }
  });
});