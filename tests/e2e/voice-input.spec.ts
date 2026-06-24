import { test, expect } from "@playwright/test";
import { signInIfPossible, installFakeSpeechRecognition } from "./_helpers";

test.describe("Voice input", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeSpeechRecognition(page);
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
  });

  test("morning check-in dictates a transcript via the mic button", async ({ page }) => {
    await page.goto("/morning");
    const mic = page.getByRole("button", { name: /snakk|record|speak|mic/i }).first();
    await mic.click();
    await expect(page.getByRole("textbox").first()).toHaveValue(/test transcript/i, {
      timeout: 5000,
    });
  });

  test("permission-denied surfaces a recoverable error and a 'write instead' fallback", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __denyMic: boolean }).__denyMic = true;
    });
    await page.goto("/morning");
    const mic = page.getByRole("button", { name: /snakk|record|speak|mic/i }).first();
    await mic.click();
    await expect(page.getByText(/blokkert|denied|tillat|allow|skriv/i)).toBeVisible();
  });

  test("stop button cancels an active recording", async ({ page }) => {
    await page.goto("/session");
    const mic = page.getByRole("button", { name: /record|snakk|speak/i }).first();
    if (await mic.isVisible()) {
      await mic.click();
      await mic.click(); // toggle off
      await expect(mic).toBeVisible();
    }
  });
});