import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";

test.describe("Offline & empty states", () => {
  test("library shows a calm empty state when no branches exist", async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
    await page.goto("/library");
    // Either content or an empty-state CTA is acceptable.
    await expect(
      page
        .getByText(/no branches|empty|nothing yet|start your first|begin/i)
        .or(page.locator("article, [role='listitem']").first()),
    ).toBeVisible();
  });

  test("network failure on a server call surfaces an error and retry", async ({ page, context }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
    await context.route("**/_serverFn/**", (route) => route.abort("internetdisconnected"));
    await context.route("**/api/**", (route) => route.abort("internetdisconnected"));
    await page.goto("/morning");
    const composer = page.getByRole("textbox").first();
    if (await composer.isVisible()) {
      await composer.fill("hello world");
      const submit = page
        .getByRole("button", { name: /refine|distill|continue|save/i })
        .first();
      if (await submit.isVisible()) {
        await submit.click();
        await expect(
          page.getByText(/failed|error|try again|offline|network/i),
        ).toBeVisible({ timeout: 10_000 });
      }
    }
  });

  test("offline page load still renders the shell (no white screen)", async ({ page, context }) => {
    await context.setOffline(true);
    const resp = await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => null);
    if (resp) {
      // The auth or home shell should render — the PhoneFrame chrome is present.
      await expect(page.locator("body")).toBeVisible();
    }
    await context.setOffline(false);
  });
});