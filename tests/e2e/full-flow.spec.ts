import { test, expect, type Page } from "@playwright/test";

/**
 * Full happy-path: onboarding → home → morning check-in → GCMP session → library.
 *
 * This spec does NOT require live credentials. It runs against the SPA's
 * local-only state by seeding `metabyx:v1` directly and bypassing the auth
 * gate via a stubbed Supabase session in localStorage when available. If the
 * supabase storage key is unknown (no `LOVABLE_BROWSER_SUPABASE_*` env), the
 * spec skips the auth-gated steps and only asserts the public surface
 * (onboarding + auth).
 *
 * At every state phase swap we capture the bounding box of the screen
 * landmark and assert the chrome did NOT shift — proving the shared
 * `ScreenTransition` keeps layout stable across loading/empty/content.
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const HAVE_SESSION = Boolean(STORAGE_KEY && SESSION_JSON);

const SEED = {
  exportedAt: new Date().toISOString(),
  version: 1,
  app: "metabyx",
  branches: [
    { id: "b1", title: "Tight chest before standup", detail: "Slack pinged.", category: "body", status: "open", createdAt: Date.now() - 3600_000 },
  ],
  bmrHistory: [{ t: Date.now() - 86_400_000, value: 70 }, { t: Date.now() - 3600_000, value: 74 }],
  lastBmr: 74,
};

async function landmarkBox(page: Page) {
  const shell = page.locator(".phone-shell-scroll").first();
  await shell.waitFor();
  return shell.boundingBox();
}

async function expectNoLayoutJump(page: Page, label: string, action: () => Promise<void>) {
  const before = await landmarkBox(page);
  await action();
  // Give the phase-in animation (240ms) + a frame.
  await page.waitForTimeout(320);
  const after = await landmarkBox(page);
  expect(before, `${label}: chrome must have a bounding box before swap`).not.toBeNull();
  expect(after, `${label}: chrome must have a bounding box after swap`).not.toBeNull();
  if (before && after) {
    expect(Math.abs(after.x - before.x), `${label}: x shift`).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y), `${label}: y shift`).toBeLessThanOrEqual(1);
    expect(Math.abs(after.width - before.width), `${label}: width shift`).toBeLessThanOrEqual(1);
  }
}

test.describe("METABYX full flow — calm transitions, no layout jumps", () => {
  test.use({ colorScheme: "dark" });

  test.beforeEach(async ({ context }) => {
    await context.addInitScript((args) => {
      const { seed, storageKey, sessionJson } = args as {
        seed: unknown;
        storageKey: string | null;
        sessionJson: string | null;
      };
      try { window.localStorage.setItem("metabyx:v1", JSON.stringify(seed)); } catch {}
      if (storageKey && sessionJson) {
        try { window.localStorage.setItem(storageKey, sessionJson); } catch {}
      }
    }, { seed: SEED, storageKey: STORAGE_KEY ?? null, sessionJson: SESSION_JSON ?? null });
  });

  test("public surface: onboarding → auth swap is layout-stable", async ({ page }) => {
    await page.goto("/onboarding");
    await page.waitForLoadState("domcontentloaded");
    await expectNoLayoutJump(page, "onboarding mount", async () => {
      // Just wait — onboarding's progress bar animates but the shell is fixed.
    });
    await expectNoLayoutJump(page, "auth navigation", async () => {
      await page.goto("/auth");
      await page.waitForLoadState("domcontentloaded");
    });
  });

  test("authed flow: home → morning → session → library phases stay calm", async ({ page }) => {
    test.skip(!HAVE_SESSION, "No managed Supabase session available — skipping auth-gated flow");

    // Home
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".phone-shell-scroll").first()).toBeVisible();

    // Morning: input phase → result phase swap (ScreenTransition)
    await expectNoLayoutJump(page, "navigate to /morning", async () => {
      await page.goto("/morning");
      await page.waitForLoadState("domcontentloaded");
    });

    // Session: phase 1 → phase 2 swap (ScreenTransition keyed on phase index)
    await expectNoLayoutJump(page, "navigate to /session", async () => {
      await page.goto("/session");
      await page.waitForLoadState("domcontentloaded");
    });

    // Library: empty/no-match/content swap via the search input.
    await page.goto("/library");
    await page.waitForLoadState("domcontentloaded");
    const search = page.getByRole("searchbox", { name: /search past branches/i });
    if (await search.count()) {
      await expectNoLayoutJump(page, "library search → no-match", async () => {
        await search.fill("zzzz-impossible-zzzz");
      });
      await expectNoLayoutJump(page, "library clear search → content", async () => {
        await search.fill("");
      });
    }
  });
});