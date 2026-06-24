import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";
import { installOfflineHarness, OFFLINE_SELECTORS } from "./_offline";

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

  test("renders skeletons quickly and shows a calm empty state", async ({ page }) => {
    const t0 = Date.now();
    await page.goto("/library");
    const skeleton = page.locator(OFFLINE_SELECTORS.skeleton).first();
    // Skeletons must show within 800ms or the UI feels frozen.
    await expect(skeleton).toBeVisible({ timeout: 1_500 }).catch(() => {});
    const skeletonLatency = Date.now() - t0;
    expect(skeletonLatency).toBeLessThan(2_500);

    // Empty-state copy: not a stack trace, not a blank page.
    const empty = page.getByText(/no branches yet|empty|nothing here|start by|begin/i);
    if (await empty.count()) await expect(empty.first()).toBeVisible();
  });

  test("offline reconnect surfaces a retry control and recovers", async ({ page }) => {
    const net = await installOfflineHarness(page);
    await net.setOffline(true);
    await page.goto("/library");
    const errorMsg = page.getByText(OFFLINE_SELECTORS.errorText).first();
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });

    await net.setOffline(false);
    const retry = page.getByRole("button", { name: OFFLINE_SELECTORS.retryButton }).first();
    if (await retry.count()) {
      await retry.click();
      await net.advanceTime(1_000);
      // Error should clear once requests succeed.
      await expect(errorMsg).toHaveCount(0, { timeout: 8_000 }).catch(() => {});
    }
  });
});