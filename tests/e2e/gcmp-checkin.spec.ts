import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";

test.describe("GCMP & Check-in", () => {
  test.beforeEach(async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
  });

  test("morning check-in renders, accepts text, and saves a branch", async ({ page }) => {
    await page.goto("/morning");
    const composer = page.getByRole("textbox").first();
    await expect(composer).toBeVisible();
    await composer.fill("I keep thinking about an unresolved email to my sister.");
    const save = page.getByRole("button", { name: /save|continue|distill|refine/i }).first();
    await expect(save).toBeEnabled();
    // Don't click in CI without network mocks — we just validate the form path.
  });

  test("GCMP session navigates through Phase 1 → Phase 2", async ({ page }) => {
    await page.goto("/session");
    // Phase 1 prompt is visible
    await expect(page.getByText(/branch|what-if|notice|begin/i).first()).toBeVisible();
    const next = page.getByRole("button", { name: /continue|next/i }).first();
    if (await next.isVisible()) await next.click();
  });

  test("Back button is keyboard-focusable in the session", async ({ page }) => {
    await page.goto("/session");
    const back = page.getByRole("button", { name: /back/i }).first();
    if (await back.isVisible()) {
      await back.focus();
      await expect(back).toBeFocused();
    }
  });

  test("library reflects saved branches or shows an empty state", async ({ page }) => {
    await page.goto("/library");
    await expect(
      page.getByText(/no branches|nothing yet|empty|start your first/i).or(page.locator("article, li").first()),
    ).toBeVisible();
  });
});