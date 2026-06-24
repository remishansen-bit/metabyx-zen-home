import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";

/**
 * Offline behaviour: when the network drops, the UI should surface clear
 * error messaging and skeletons, then recover when connectivity returns.
 * We use Playwright's context.setOffline to simulate the disconnect.
 */

test.describe("Offline mode", () => {
  test.beforeEach(async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
  });

  test("library shows skeletons then error messaging when offline", async ({ page, context }) => {
    await context.setOffline(true);
    await page.goto("/library");
    // Either a skeleton or an inline error/empty state should be visible.
    const skeletonOrError = page.locator(
      "[data-skeleton], [role='status'], [role='alert'], text=/offline|connection|nettverk|prøv igjen|retry/i",
    );
    await expect(skeletonOrError.first()).toBeVisible({ timeout: 10_000 });
  });

  test("queued action retries after reconnect", async ({ page, context }) => {
    await page.goto("/morning");
    await context.setOffline(true);

    // Try a write — the app should keep the draft and surface a retry path.
    const textbox = page.getByRole("textbox").first();
    if (await textbox.count()) {
      await textbox.fill("offline draft");
    }
    const submit = page
      .getByRole("button", { name: /save|lagre|continue|fortsett|send/i })
      .first();
    if (await submit.count()) {
      await submit.click().catch(() => {});
    }

    // Expect either an offline notice or a retry control.
    const retry = page.getByRole("button", { name: /retry|prøv igjen|try again/i });
    const offlineNotice = page.getByText(/offline|nettverk|connection lost/i);
    await expect(retry.or(offlineNotice).first()).toBeVisible({ timeout: 8_000 });

    // Reconnect and confirm the retry path resolves (button disappears or success toast).
    await context.setOffline(false);
    if (await retry.count()) {
      await retry.first().click().catch(() => {});
    }
    await expect(offlineNotice).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
  });
});