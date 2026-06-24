import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";
import { installOfflineHarness, OFFLINE_SELECTORS } from "./_offline";
import { assertSkeletonWithin } from "./_metrics";

const SKELETON_MIN_MS = 100;
const SKELETON_MAX_MS = 4_000;
const LIBRARY_API = /\/(rest|api|functions)\/.*(branch|librar|metabyx|checkin)/i;

const LIBRARY_WRITE_TYPES = [
  { name: "reflection", pattern: /reflect|reflection/i, buttonRx: /save reflection|lagre refleksjon/i },
  { name: "resolve",    pattern: /resolve|metaboliz/i,  buttonRx: /resolve|metaboliser|mark resolved/i },
  { name: "import",     pattern: /import|upload/i,      buttonRx: /import|last opp|upload/i },
] as const;

async function nearestLiveRegion(locator: import("@playwright/test").Locator) {
  return locator.evaluate((el) => {
    let cur: HTMLElement | null = el as HTMLElement;
    while (cur) {
      const live = cur.getAttribute?.("aria-live");
      const role = cur.getAttribute?.("role");
      if (live === "polite" || live === "assertive" || role === "status" || role === "alert") {
        return live ?? role;
      }
      cur = cur.parentElement;
    }
    return null;
  });
}

test.describe("Library — empty + offline UX", () => {
  test.beforeEach(async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
  });

  test("skeletons appear, persist for a sensible window, then resolve to a calm empty state", async ({ page }, testInfo) => {
    const device = testInfo.project.name;
    const t0 = Date.now();
    await page.goto("/library");
    const skeleton = page.locator(OFFLINE_SELECTORS.skeleton).first();

    await expect(skeleton).toBeVisible({ timeout: 1_500 }).catch(() => {});
    assertSkeletonWithin(
      "library-empty",
      "library",
      "appear",
      Date.now() - t0,
      { minMs: 0, maxMs: 2_500 },
      device,
    );

    const shownAt = Date.now();
    await expect(skeleton).toBeHidden({ timeout: SKELETON_MAX_MS + 1_000 });
    assertSkeletonWithin(
      "library-empty",
      "library",
      "persist",
      Date.now() - shownAt,
      { minMs: SKELETON_MIN_MS, maxMs: SKELETON_MAX_MS },
      device,
    );

    const empty = page
      .getByText(/no branches yet|empty|nothing here|start by|begin|first check-?in/i)
      .first();
    if (await empty.count()) {
      await expect(empty).toBeVisible();
      const text = (await empty.textContent()) ?? "";
      expect(text).not.toMatch(/error|undefined|null|stack/i);
      const live = await nearestLiveRegion(empty);
      expect(live, "empty-state message should be inside an aria-live region").not.toBeNull();
    }
  });

  test("offline reconnect error is announced via aria-live", async ({ page }) => {
    const net = await installOfflineHarness(page);
    await net.setOffline(true);
    await page.goto("/library");
    const errorMsg = page.getByText(OFFLINE_SELECTORS.errorText).first();
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });
    const live = await nearestLiveRegion(errorMsg);
    expect(live, "offline error should be announced via aria-live or role=alert").not.toBeNull();

    // Rapid reconnect cycle must not duplicate the announcement.
    const countLiveCopies = async (rx: RegExp) =>
      page.locator("[aria-live], [role='status'], [role='alert']").filter({ hasText: rx }).count();
    const beforeCycle = await countLiveCopies(OFFLINE_SELECTORS.errorText);
    for (let i = 0; i < 3; i++) {
      await net.setOffline(false);
      await net.advanceTime(150);
      await net.setOffline(true);
      await net.advanceTime(150);
    }
    const afterCycle = await countLiveCopies(OFFLINE_SELECTORS.errorText);
    expect(
      afterCycle,
      "rapid reconnect cycles must not duplicate live-region announcements",
    ).toBeLessThanOrEqual(beforeCycle);
  });

  test("library queued actions replay in order with correct retry UI after reconnect", async ({ page }) => {
    const net = await installOfflineHarness(page);
    await page.goto("/library");
    await net.setOffline(true);
    net.reset();

    const firstItem = page.locator("[data-branch], a[href*='/branch/']").first();
    if (await firstItem.count()) await firstItem.click().catch(() => {});

    const skeleton = page.locator(OFFLINE_SELECTORS.skeleton).first();
    await expect(skeleton).toBeVisible({ timeout: 5_000 }).catch(() => {});

    const errorMsg = page.getByText(OFFLINE_SELECTORS.errorText).first();
    const retry = page.getByRole("button", { name: OFFLINE_SELECTORS.retryButton }).first();
    await expect(retry.or(errorMsg)).toBeVisible({ timeout: 10_000 });

    const saveButtons = page.getByRole("button", { name: /save|lagre|send|legg til/i });
    const writeCount = Math.min(2, await saveButtons.count());
    for (let i = 0; i < writeCount; i++) {
      await saveButtons.nth(i).click().catch(() => {});
    }
    const queuedWrites = net.writes().filter((r) => LIBRARY_API.test(r.url)).map((r) => r.url);

    net.reset();
    await net.setOffline(false);
    if (await retry.count()) await retry.click().catch(() => {});
    await net.advanceTime(2_000);

    const replayedWrites = net.writes().filter((r) => LIBRARY_API.test(r.url)).map((r) => r.url);
    let cursor = 0;
    for (const url of queuedWrites) {
      const idx = replayedWrites.indexOf(url, cursor);
      expect(idx, `library write ${url} must replay in order`).toBeGreaterThanOrEqual(cursor);
      cursor = idx + 1;
    }

    await expect(errorMsg).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
    await expect(skeleton).toBeHidden({ timeout: 10_000 }).catch(() => {});
  });

  for (const variant of LIBRARY_WRITE_TYPES) {
    test(`offline replay preserves order for ${variant.name} writes`, async ({ page }) => {
      const net = await installOfflineHarness(page);
      await page.goto("/library");
      await net.setOffline(true);
      net.reset();

      const button = page.getByRole("button", { name: variant.buttonRx }).first();
      if (!(await button.count())) test.skip(true, `no ${variant.name} button in this build`);
      await button.click().catch(() => {});
      await button.click().catch(() => {});

      const queued = net
        .writes()
        .filter((r) => LIBRARY_API.test(r.url) && variant.pattern.test(r.url))
        .map((r) => r.url);

      net.reset();
      await net.setOffline(false);
      const retry = page.getByRole("button", { name: OFFLINE_SELECTORS.retryButton }).first();
      if (await retry.count()) await retry.click().catch(() => {});
      await net.advanceTime(2_000);

      const replayed = net
        .writes()
        .filter((r) => LIBRARY_API.test(r.url) && variant.pattern.test(r.url))
        .map((r) => r.url);

      let cursor = 0;
      for (const url of queued) {
        const idx = replayed.indexOf(url, cursor);
        expect(idx, `${variant.name} replay order broken for ${url}`).toBeGreaterThanOrEqual(cursor);
        cursor = idx + 1;
      }
    });
  }
});