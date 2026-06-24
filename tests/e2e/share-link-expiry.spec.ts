import { test, expect } from "@playwright/test";

/**
 * Share-link expiry — exercises the live countdown + expired state.
 *
 * We don't drive Supabase from the test: the public viewer reads
 * `expires_at` from the server payload and renders the countdown via the
 * `useExpiresInLabel` hook, which re-renders on a short interval. We stub
 * the network response so we can put the deadline a few seconds out and
 * watch the UI flip without waiting 30 days.
 */

const TOKEN = "playwright-expiry-token";

function payload(secondsFromNow: number) {
  const expires = new Date(Date.now() + secondsFromNow * 1000).toISOString();
  return [
    {
      token: TOKEN,
      kind: "reflection",
      title: "Test reflection",
      body: "This link is live for a few seconds.",
      snapshot: {},
      anonymous: false,
      author_label: "Tester",
      created_at: new Date().toISOString(),
      expires_at: expires,
    },
  ];
}

test("public viewer shows countdown then expired state", async ({ page }) => {
  // Intercept the server-fn POST that backs fetchPublicShareLink. The
  // TanStack server-fn RPC posts to /_serverFn/... — match on the URL
  // containing the function module path is brittle; match all POSTs to the
  // serverFn route instead and inspect the body for the token.
  await page.route("**/_serverFn/**", async (route) => {
    const req = route.request();
    const body = req.postData() ?? "";
    if (!body.includes(TOKEN)) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: payload(6)[0] }),
    });
  });

  await page.goto(`/s/${TOKEN}`);

  // Active state with countdown visible.
  await expect(page.getByTestId("share-active")).toBeVisible();
  const expiry = page.getByTestId("share-expiry");
  await expect(expiry).toBeVisible();
  await expect(expiry).toContainText(/Expires (in |soon)/i);

  // Wait past the deadline; live tick should flip the card to expired.
  await expect(page.getByTestId("share-expired")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("share-active")).toHaveCount(0);
});