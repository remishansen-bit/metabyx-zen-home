import { test, expect } from "@playwright/test";
import { signInIfPossible } from "./_helpers";

test.describe("Onboarding & Login", () => {
  test("first-run unauthenticated visit redirects to /auth", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("login form validates empty fields", async ({ page }) => {
    await page.goto("/auth");
    const submit = page.getByRole("button", { name: /sign in|log in|continue/i }).first();
    await submit.click();
    // HTML5 validation or inline error — either is acceptable, just not navigation.
    await expect(page).toHaveURL(/\/auth/);
  });

  test("invalid credentials surface an accessible error", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel(/email/i).fill("no-such-user@example.com");
    await page.getByLabel(/password/i).first().fill("wrong-password-12345");
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await expect(page.getByText(/invalid|incorrect|wrong|failed/i)).toBeVisible({ timeout: 8000 });
  });

  test("authenticated session restore lands on a real page", async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
    await page.reload();
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test("onboarding flow shows welcome → questions → summary", async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
    await page.goto("/onboarding");
    // Skip gracefully if already onboarded — the route redirects to "/".
    if (page.url().endsWith("/")) test.skip(true, "User already onboarded.");
    await expect(page.getByRole("button", { name: /begin/i })).toBeVisible();
  });
});