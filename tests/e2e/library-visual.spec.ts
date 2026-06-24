import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";
import { installOfflineHarness, OFFLINE_SELECTORS } from "./_offline";

/**
 * Visual regression for the three Library "transition" states:
 * skeleton → offline error / retry → empty (or content) after reconnect.
 * Update baselines with: ./scripts/update-visual-baselines.sh --screens library-skeleton,library-offline,library-empty
 */

const FREEZE = `*, *::before, *::after {
  animation-duration: 0s !important; animation-delay: 0s !important;
  transition-duration: 0s !important; transition-delay: 0s !important;
}`;

test.describe("visual: library transitions", () => {
  test.beforeEach(async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
  });

  test("visual: library-skeleton + library-offline + library-empty", async ({ page }) => {
    const net = await installOfflineHarness(page);

    // 1. Skeleton state — hold the network so the loading UI is captured.
    await net.setOffline(true);
    await page.goto("/library");
    await page.addStyleTag({ content: FREEZE });
    const skeleton = page.locator(OFFLINE_SELECTORS.skeleton).first();
    await expect(skeleton).toBeVisible({ timeout: 5_000 }).catch(() => {});
    await expect(page).toHaveScreenshot("library-skeleton.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    });

    // 2. Offline error / retry UI.
    const errorMsg = page.getByText(OFFLINE_SELECTORS.errorText).first();
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveScreenshot("library-offline.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    });

    // 3. Reconnect → empty/content state.
    await net.setOffline(false);
    const retry = page.getByRole("button", { name: OFFLINE_SELECTORS.retryButton }).first();
    if (await retry.count()) await retry.click().catch(() => {});
    await net.advanceTime(1_500);
    await page.addStyleTag({ content: FREEZE });
    await expect(page).toHaveScreenshot("library-empty.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    });
  });
});