import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
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

/** Walk the tab order and assert each focused element has a non-empty
 *  focus-visible outline / ring / box-shadow — i.e. keyboard users see
 *  where they are. Returns the tag list for debugging. */
async function expectVisibleFocusStyles(page: Page, presses = 8) {
  const order: string[] = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = window.getComputedStyle(el);
      const hasRing =
        (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
        s.boxShadow !== "none" ||
        parseFloat(s.borderWidth || "0") > 0;
      return {
        tag: el.tagName,
        label: el.getAttribute("aria-label") ?? el.textContent?.slice(0, 20) ?? "",
        hasRing,
      };
    });
    if (!info) continue;
    order.push(`${info.tag}:${info.label}`);
    expect(
      info.hasRing,
      `focused ${info.tag} "${info.label}" has no visible focus indicator`,
    ).toBe(true);
  }
  expect(new Set(order).size, "Tab order should advance through distinct elements").toBeGreaterThan(1);
  return order;
}

const A11Y_REPORT_DIR = "a11y-report";

function appendAxeHtmlReport(label: string, results: import("axe-core").AxeResults) {
  mkdirSync(A11Y_REPORT_DIR, { recursive: true });
  const indexPath = join(A11Y_REPORT_DIR, "index.html");
  const seed = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : `<!doctype html><html><head><meta charset="utf-8"><title>METABYX axe-core report</title>
<style>body{font:14px/1.5 ui-sans-serif,system-ui;margin:24px;color:#111;background:#fff}
h1{font-size:22px}h2{margin-top:32px;border-bottom:1px solid #ddd;padding-bottom:6px}
.v{border-left:4px solid #c00;padding:8px 12px;margin:8px 0;background:#fff5f5}
.v.minor{border-color:#888;background:#f6f6f6}.v.moderate{border-color:#d80}
.tag{display:inline-block;font-size:11px;background:#eee;padding:2px 6px;border-radius:4px;margin-right:4px}
pre{background:#0b1020;color:#e6edf3;padding:8px;border-radius:6px;overflow:auto;font-size:12px}
</style></head><body><h1>METABYX axe-core report</h1><div id="r"></div></body></html>`;
  const section = `
<h2>${label} — ${results.violations.length} violation(s)</h2>
${results.violations
  .map(
    (v) => `<div class="v ${v.impact ?? ""}">
  <strong>${v.id}</strong> <span class="tag">${v.impact ?? "n/a"}</span> ${v.help}<br/>
  <a href="${v.helpUrl}" target="_blank" rel="noopener">${v.helpUrl}</a>
  <pre>${v.nodes
    .slice(0, 4)
    .map((n) => (n.html ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!)))
    .join("\n\n")}</pre>
</div>`,
  )
  .join("\n") || "<p>✓ No violations.</p>"}`;
  const next = seed.replace('<div id="r"></div>', `<div id="r"></div>${section}`);
  writeFileSync(indexPath, next, "utf8");
}

/** Run axe-core, write findings to an HTML report, fail on serious/critical. */
async function runAxe(page: Page, label = "page") {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"]) // glass UI is intentionally low-contrast in places
    .analyze();
  appendAxeHtmlReport(label, results);
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious,
    `axe violations:\n${serious.map((v) => `${v.id}: ${v.help}`).join("\n")}`,
  ).toEqual([]);
}

test.describe("Accessibility — onboarding", () => {
  test("welcome step exposes labelled controls and a tabbable Begin button", async ({ page }) => {
    await page.goto("/onboarding");
    await expectInteractiveHasName(page);
    await expectFocusOrderAdvances(page);
    await expectVisibleFocusStyles(page);
    await runAxe(page, "onboarding");
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
    await expectVisibleFocusStyles(page);
    await runAxe(page, "morning");
  });

  test("evening reflection screen interactive elements are named", async ({ page }) => {
    await page.goto("/evening");
    await expectInteractiveHasName(page);
    await expectFocusOrderAdvances(page);
    await expectVisibleFocusStyles(page);
    await runAxe(page, "evening");
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
    await runAxe(page, "voice-input");
  });
});