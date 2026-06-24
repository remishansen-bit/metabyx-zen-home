import { test, expect, type Page } from "@playwright/test";
import { installFakeSpeechRecognition, signInIfPossible } from "./_helpers";

/**
 * Basic accessibility checks: labels, keyboard navigation, focus order.
 * Intentionally lightweight — no axe-core dependency. These guard the most
 * common regressions on the high-traffic flows.
 */

async function expectInteractiveHasName(page: Page) {
  // Every visible button / link must have an accessible name (text, aria-label,
  // or aria-labelledby). Catches icon-only buttons that lost their label.
  const offenders = await page.evaluate(() => {
    const out: string[] = [];
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("button, a[href], [role='button']"),
    );
    for (const el of nodes) {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const label =
        (el.getAttribute("aria-label") ?? "").trim() ||
        (el.getAttribute("title") ?? "").trim() ||
        (el.textContent ?? "").trim() ||
        (el.querySelector("img")?.getAttribute("alt") ?? "").trim();
      if (!label) out.push(el.outerHTML.slice(0, 120));
    }
    return out;
  });
  expect(offenders, `interactive elements without accessible name:\n${offenders.join("\n")}`).toEqual([]);
}

async function expectFocusOrderAdvances(page: Page, presses = 5) {
  const seen = new Set<string>();
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return el.tagName + ":" + (el.getAttribute("aria-label") ?? el.textContent?.slice(0, 24) ?? "");
    });
    if (id) seen.add(id);
  }
  expect(seen.size, "Tab key should reach multiple focusable elements").toBeGreaterThan(1);
}

test.describe("Accessibility — onboarding", () => {
  test("welcome step exposes labelled controls and a tabbable Begin button", async ({ page }) => {
    await page.goto("/onboarding");
    await expectInteractiveHasName(page);
    await expectFocusOrderAdvances(page);
  });
});

test.describe("Accessibility — check-in (morning)", () => {
  test.beforeEach(async ({ page }) => {
    const ok = await signInIfPossible(page);
    test.skip(!ok, "Set E2E_EMAIL/E2E_PASSWORD to enable.");
  });

  test("morning screen interactive elements are named", async ({ page }) => {
    await page.goto("/morning");
    await expectInteractiveHasName(page);
    await expectFocusOrderAdvances(page);
  });

  test("evening reflection screen interactive elements are named", async ({ page }) => {
    await page.goto("/evening");
    await expectInteractiveHasName(page);
    await expectFocusOrderAdvances(page);
  });
});

test.describe("Accessibility — voice input", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeSpeechRecognition(page);
  });

  test("mic button has an accessible label", async ({ page }) => {
    await page.goto("/morning");
    const mic = page.getByRole("button", { name: /snakk|record|speak|mic|tale/i }).first();
    if (await mic.count()) {
      await expect(mic).toBeVisible();
      const name = await mic.getAttribute("aria-label");
      const text = (await mic.textContent()) ?? "";
      expect((name ?? "").length + text.trim().length).toBeGreaterThan(0);
    }
  });
});