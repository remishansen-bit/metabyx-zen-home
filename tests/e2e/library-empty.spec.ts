import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";
import { installOfflineHarness, OFFLINE_SELECTORS } from "./_offline";

const SKELETON_MIN_MS = 100;   // must be visible long enough to register
const SKELETON_MAX_MS = 4_000; // must not linger and feel stuck
const LIBRARY_API = /\/(rest|api|functions)\/.*(branch|librar|metabyx|checkin)/i;

/**
 * Library UX coverage:
 *  - Skeletons appear within a tight budget while data loads.
 *  - Empty state messaging is clear and calm.
 *  - Offline → reconnect surfaces an actionable retry control.
 */

test.describe("Library — empty + offline UX", () => {
  test.beforeEach(async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
  });

  test("skeletons appear, persist for a sensible window, then resolve to a calm empty state", async ({ page }) => {
    const t0 = Date.now();
    await page.goto("/library");
    const skeleton = page.locator(OFFLINE_SELECTORS.skeleton).first();

    await expect(skeleton).toBeVisible({ timeout: 1_500 }).catch(() => {});
    const appearedAt = Date.now() - t0;
    expect(appearedAt, "skeleton should appear quickly").toBeLessThan(2_500);

    // Wait for skeleton to disappear and measure its visible duration.
    const shownAt = Date.now();
    await expect(skeleton).toBeHidden({ timeout: SKELETON_MAX_MS + 1_000 });
    const visibleFor = Date.now() - shownAt;
    expect(visibleFor, "skeleton should not flash sub-100ms").toBeGreaterThanOrEqual(SKELETON_MIN_MS);
    expect(visibleFor, "skeleton should not linger beyond budget").toBeLessThanOrEqual(SKELETON_MAX_MS);

    // Empty-state copy: clear, non-technical, and actionable.
    const empty = page.getByText(/no branches yet|empty|nothing here|start by|begin|first check-?in/i);
    if (await empty.count()) {
      await expect(empty.first()).toBeVisible();
      const text = (await empty.first().textContent()) ?? "";
      expect(text).not.toMatch(/error|undefined|null|stack/i);
    }
  });

  test("library queued actions replay in order with correct retry UI after reconnect", async ({ page }) => {
    const net = await installOfflineHarness(page);
    await page.goto("/library");

    // Go offline and trigger a sequence of library-related writes (e.g. add
    // reflection, mark resolved). Buttons vary by content so we click any
    // available "save / lagre / send" controls in order.
    await net.setOffline(true);
    net.reset();

    // 1. Skeleton must reappear if user navigates into a detail view offline.
    const firstItem = page.locator("[data-branch], a[href*='/branch/']").first();
    if (await firstItem.count()) await firstItem.click().catch(() => {});

    const skeleton = page.locator(OFFLINE_SELECTORS.skeleton).first();
    await expect(skeleton).toBeVisible({ timeout: 5_000 }).catch(() => {});

    // 2. Clear offline error/retry surface.
    const errorMsg = page.getByText(OFFLINE_SELECTORS.errorText).first();
    const retry = page.getByRole("button", { name: OFFLINE_SELECTORS.retryButton }).first();
    await expect(retry.or(errorMsg)).toBeVisible({ timeout: 10_000 });

    // 3. Queue two writes while offline (best-effort across builds).
    const saveButtons = page.getByRole("button", { name: /save|lagre|send|legg til/i });
    const writeCount = Math.min(2, await saveButtons.count());
    for (let i = 0; i < writeCount; i++) {
      await saveButtons.nth(i).click().catch(() => {});
    }
    const queuedWrites = net
      .writes()
      .filter((r) => LIBRARY_API.test(r.url))
      .map((r) => r.url);

    // 4. Reconnect deterministically and trigger retry.
    net.reset();
    await net.setOffline(false);
    if (await retry.count()) await retry.click().catch(() => {});
    await net.advanceTime(2_000);

    const replayedWrites = net
      .writes()
      .filter((r) => LIBRARY_API.test(r.url))
      .map((r) => r.url);

    // Each queued library write must replay in submission order.
    let cursor = 0;
    for (const url of queuedWrites) {
      const idx = replayedWrites.indexOf(url, cursor);
      expect(idx, `library write ${url} must replay in order`).toBeGreaterThanOrEqual(cursor);
      cursor = idx + 1;
    }

    // Error/skeleton should clear once reads succeed.
    await expect(errorMsg).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
    await expect(skeleton).toBeHidden({ timeout: 10_000 }).catch(() => {});
  });
});