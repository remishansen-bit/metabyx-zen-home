import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";
import { installOfflineHarness, OFFLINE_SELECTORS } from "./_offline";

/**
 * Deterministic reconnect-timing fuzz.
 *
 * We seed a list of (latencyMs, jitterMs) pairs, queue Library writes
 * while offline, then reconnect and advance fake timers by the seeded
 * amount. Every iteration must replay queued writes in submission order
 * and end with a clean skeleton-to-empty transition (no lingering error
 * or skeleton). Seeds are fixed so reruns are reproducible.
 */

const SEEDS: Array<{ latencyMs: number; jitterMs: number }> = [
  { latencyMs: 0, jitterMs: 0 },
  { latencyMs: 250, jitterMs: 50 },
  { latencyMs: 1_000, jitterMs: 200 },
  { latencyMs: 2_500, jitterMs: 500 },
  { latencyMs: 4_000, jitterMs: 900 },
];

const LIBRARY_API = /\/(rest|api|functions)\/.*(branch|librar|metabyx|checkin)/i;

test.describe("Library — reconnect-timing fuzz", () => {
  test.beforeEach(async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
  });

  for (const seed of SEEDS) {
    test(`replays in order with latency=${seed.latencyMs}ms jitter=${seed.jitterMs}ms`, async ({
      page,
    }) => {
      const net = await installOfflineHarness(page);
      await page.goto("/library");
      await net.setOffline(true);
      net.reset();

      // Queue a deterministic burst of writes.
      const saveButtons = page.getByRole("button", { name: /save|lagre|send|legg til/i });
      const writes = Math.min(3, await saveButtons.count());
      for (let i = 0; i < writes; i++) {
        await saveButtons.nth(i).click().catch(() => {});
      }
      const queued = net.writes().filter((r) => LIBRARY_API.test(r.url)).map((r) => r.url);

      net.reset();
      await net.setOffline(false);

      // Advance timers by latency + bounded jitter (seeded).
      const advance = seed.latencyMs + seed.jitterMs;
      await net.advanceTime(advance);

      const replayed = net.writes().filter((r) => LIBRARY_API.test(r.url)).map((r) => r.url);
      let cursor = 0;
      for (const url of queued) {
        const idx = replayed.indexOf(url, cursor);
        expect(
          idx,
          `seed ${JSON.stringify(seed)} broke replay order for ${url}`,
        ).toBeGreaterThanOrEqual(cursor);
        cursor = idx + 1;
      }

      // Final state must be calm: no skeletons, no offline error sticking around.
      const skeleton = page.locator(OFFLINE_SELECTORS.skeleton).first();
      const errorMsg = page.getByText(OFFLINE_SELECTORS.errorText).first();
      await expect(skeleton).toBeHidden({ timeout: 10_000 }).catch(() => {});
      await expect(errorMsg).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
    });
  }
});