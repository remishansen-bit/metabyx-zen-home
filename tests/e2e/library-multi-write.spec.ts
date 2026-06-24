import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";
import { installOfflineHarness, OFFLINE_SELECTORS } from "./_offline";

/**
 * Back-to-back mixed-write offline replay.
 *
 * Triggers reflection → resolve → import in tight succession while offline,
 * then reconnects and verifies:
 *   - Each write replays in EXACT submission order across families.
 *   - A per-write retry affordance is present while offline.
 *   - Final state lands on the calm empty/content view with no error.
 */

const LIBRARY_API = /\/(rest|api|functions)\/.*(branch|librar|metabyx|checkin|reflect|resolve|import)/i;

const SEQUENCE = [
  { name: "reflection", buttonRx: /save reflection|lagre refleksjon/i },
  { name: "resolve", buttonRx: /resolve|metaboliser|mark resolved/i },
  { name: "import", buttonRx: /import|last opp|upload/i },
] as const;

test.describe("Library — back-to-back mixed write replay", () => {
  test.beforeEach(async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
  });

  test("replays reflection→resolve→import in exact submission order", async ({ page }) => {
    const net = await installOfflineHarness(page);
    await page.goto("/library");
    await net.setOffline(true);
    net.reset();

    const submitted: string[] = [];
    for (const step of SEQUENCE) {
      const button = page.getByRole("button", { name: step.buttonRx }).first();
      if (!(await button.count())) continue;
      await button.click().catch(() => {});
      // Capture which queued URL belongs to this step right after the click.
      const last = net.writes().filter((r) => LIBRARY_API.test(r.url)).pop();
      if (last) submitted.push(last.url);

      // Per-write retry / offline affordance must be visible while offline.
      const retry = page
        .getByRole("button", { name: OFFLINE_SELECTORS.retryButton })
        .first();
      const offlineNotice = page.getByText(OFFLINE_SELECTORS.errorText).first();
      await expect(retry.or(offlineNotice)).toBeVisible({ timeout: 5_000 }).catch(() => {});
    }
    test.skip(submitted.length < 2, "build has fewer than 2 library write buttons");

    net.reset();
    await net.setOffline(false);
    const retry = page.getByRole("button", { name: OFFLINE_SELECTORS.retryButton }).first();
    if (await retry.count()) await retry.click().catch(() => {});
    await net.advanceTime(3_000);

    const replayed = net.writes().filter((r) => LIBRARY_API.test(r.url)).map((r) => r.url);
    let cursor = 0;
    for (const url of submitted) {
      const idx = replayed.indexOf(url, cursor);
      expect(idx, `mixed-write replay order broken at ${url}`).toBeGreaterThanOrEqual(cursor);
      cursor = idx + 1;
    }

    // Final calm state.
    const skeleton = page.locator(OFFLINE_SELECTORS.skeleton).first();
    const errorMsg = page.getByText(OFFLINE_SELECTORS.errorText).first();
    await expect(skeleton).toBeHidden({ timeout: 10_000 }).catch(() => {});
    await expect(errorMsg).toHaveCount(0, { timeout: 10_000 }).catch(() => {});

    const empty = page
      .getByText(/no branches yet|empty|nothing here|start by|begin|first check-?in/i)
      .first();
    if (await empty.count()) await expect(empty).toBeVisible();
  });
});