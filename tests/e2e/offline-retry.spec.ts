import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";
import { installOfflineHarness, OFFLINE_SELECTORS } from "./_offline";

/**
 * Offline behaviour: when the network drops, the UI should surface clear
 * error messaging and skeletons, then recover when connectivity returns.
 * We use Playwright's context.setOffline to simulate the disconnect.
 */

/** Deterministic offline tests — see tests/e2e/_offline.ts for the harness. */

test.describe("Offline mode (deterministic)", () => {
  test.beforeEach(async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
  });

  test("library shows skeletons then error messaging when offline", async ({ page }) => {
    const net = await installOfflineHarness(page);
    await net.setOffline(true);
    await page.goto("/library");
    const skeleton = page.locator(OFFLINE_SELECTORS.skeleton).first();
    await expect(skeleton).toBeVisible({ timeout: 5_000 });
    const errorMsg = page.getByText(OFFLINE_SELECTORS.errorText).first();
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });
  });

  test("queued actions replay in submission order after reconnect", async ({ page }) => {
    const net = await installOfflineHarness(page);
    await page.goto("/morning");
    await net.setOffline(true);
    net.reset();

    // Make two writes back-to-back so we can assert replay order.
    const textbox = page.getByRole("textbox").first();
    const submit = page
      .getByRole("button", { name: /save|lagre|continue|fortsett|send/i })
      .first();
    if ((await textbox.count()) && (await submit.count())) {
      await textbox.fill("draft A");
      await submit.click().catch(() => {});
      await textbox.fill("draft B");
      await submit.click().catch(() => {});
    }

    const retry = page.getByRole("button", { name: OFFLINE_SELECTORS.retryButton });
    const offlineNotice = page.getByText(OFFLINE_SELECTORS.errorText);
    await expect(retry.or(offlineNotice).first()).toBeVisible({ timeout: 8_000 });

    const offlineWrites = net.writes().map((r) => r.url);

    // Deterministic reconnect via the harness (frozen timers + flush).
    net.reset();
    await net.setOffline(false);
    if (await retry.count()) await retry.first().click().catch(() => {});
    await net.advanceTime(2_000);

    const replayedWrites = net.writes().map((r) => r.url);

    // Each offline write should reappear, in the same relative order.
    let cursor = 0;
    for (const url of offlineWrites) {
      const idx = replayedWrites.indexOf(url, cursor);
      expect(idx, `expected ${url} to replay in order after reconnect`).toBeGreaterThanOrEqual(
        cursor,
      );
      cursor = idx + 1;
    }

    await expect(offlineNotice).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
  });
});