import type { Page, Route } from "@playwright/test";

/**
 * Reusable deterministic offline harness for Playwright.
 *
 * - Intercepts every API/REST/functions/auth/storage call.
 * - When `setOffline(true)`, matching requests are aborted with
 *   "internetdisconnected", so the app's offline error path fires
 *   instantly with no flaky `context.setOffline` race.
 * - When `setOffline(false)`, queued requests pass through and the
 *   reconnect timing is controlled by `advanceTime(ms)` — which both
 *   advances fake timers in the page and flushes the request log so
 *   tests can assert replay order deterministically.
 *
 * Usage:
 *   const net = await installOfflineHarness(page);
 *   await net.setOffline(true);
 *   // ...user actions while offline
 *   await net.setOffline(false);
 *   await net.advanceTime(2000); // flush retry timers
 *   expect(net.writes()).toEqual([...]);
 */

export type RecordedRequest = { url: string; method: string; at: number };

const API_PATTERN = /\/(api|rest|functions|auth|storage)\//i;

export interface OfflineHarness {
  setOffline(value: boolean): Promise<void>;
  advanceTime(ms: number): Promise<void>;
  writes(): RecordedRequest[];
  reads(): RecordedRequest[];
  reset(): void;
}

export async function installOfflineHarness(page: Page): Promise<OfflineHarness> {
  const state = { offline: false };
  const log: RecordedRequest[] = [];

  // Freeze Date.now() / setTimeout drift before any app code runs so
  // retry/backoff schedulers behave the same on every CI machine.
  await page.addInitScript(() => {
    const origNow = Date.now.bind(Date);
    const base = origNow();
    let offset = 0;
    Date.now = () => base + offset;
    (window as unknown as { __advanceTime: (ms: number) => void }).__advanceTime = (ms: number) => {
      offset += ms;
    };
  });

  await page.route("**/*", async (route: Route) => {
    const req = route.request();
    const url = req.url();
    if (!API_PATTERN.test(url)) return route.continue();
    log.push({ url, method: req.method(), at: Date.now() });
    if (state.offline) return route.abort("internetdisconnected");
    return route.continue();
  });

  return {
    async setOffline(value: boolean) {
      state.offline = value;
    },
    async advanceTime(ms: number) {
      await page.evaluate((delta) => {
        (window as unknown as { __advanceTime?: (ms: number) => void }).__advanceTime?.(delta);
      }, ms);
      // Yield a microtask + small real wait so any scheduled fetch flushes.
      await page.waitForTimeout(Math.min(ms, 300));
    },
    writes() {
      return log.filter((r) => r.method !== "GET" && r.method !== "HEAD");
    },
    reads() {
      return log.filter((r) => r.method === "GET" || r.method === "HEAD");
    },
    reset() {
      log.length = 0;
    },
  };
}

/** Standard skeleton + error-message assertions used across offline specs. */
export const OFFLINE_SELECTORS = {
  skeleton: "[data-skeleton], [role='status']",
  errorText: /offline|connection|nettverk|prøv igjen|retry|kunne ikke|tilkobling/i,
  retryButton: /retry|prøv igjen|try again/i,
} as const;