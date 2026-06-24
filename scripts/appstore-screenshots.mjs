#!/usr/bin/env node
/**
 * App Store screenshot generator for METABYX.
 *
 * Captures hero screens at iPhone 16 (393×852) and iPhone 16 Pro (402×874)
 * device-CSS sizes with DPR 3 (Retina). Output lands under
 * /mnt/documents/appstore/<device>/NN-<slug>.png and a contact-sheet
 * `/mnt/documents/appstore/index.html` is generated for quick review.
 *
 * Usage:
 *   # one-time: bunx playwright install chromium
 *   node scripts/appstore-screenshots.mjs                       # uses http://localhost:8080
 *   BASE_URL=https://... node scripts/appstore-screenshots.mjs  # use a deployed preview
 *
 * Auth-protected screens (check-in, voice, library, profile) read seeded
 * demo data injected into localStorage before navigation, so no real account
 * is required.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";
const OUT_ROOT = process.env.OUT_DIR ?? "/mnt/documents/appstore";

/** Locate a chromium binary. Prefers Playwright's own download; falls back to
 * a system chromium (e.g. the sandbox-bundled /chromium-NNNN/chrome-linux). */
function findChromiumExecutable() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  for (const p of ["/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/bin/chromium"]) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** The hero set — keep order stable; App Store cares about the first 3. */
const SHOTS = [
  { slug: "01-home",       path: "/",            wait: '[data-testid="bmr-score"], h1' },
  { slug: "02-morning",    path: "/morning",     wait: "h1" },
  { slug: "03-session",    path: "/session",     wait: "h1, [role=main]" },
  { slug: "04-library",    path: "/library",     wait: "h1" },
  { slug: "05-profile",    path: "/profile",     wait: "h1" },
  { slug: "06-evening",    path: "/evening",     wait: "h1" },
];

const DEVICES = [
  { name: "iphone-16",     width: 393, height: 852 },
  { name: "iphone-16-pro", width: 402, height: 874 },
];

/** Deterministic seed for the local Zustand store so screenshots aren't empty. */
const SEED_PAYLOAD = {
  exportedAt: new Date().toISOString(),
  version: 1,
  app: "metabyx",
  branches: [
    { id: "b1", title: "Tight chest before standup",   detail: "Noticed a wave of pressure as Slack pinged.", category: "body",         status: "open",         createdAt: Date.now() - 1 * 3600_000 },
    { id: "b2", title: "Quiet morning with coffee",    detail: "Sat by the window, watched steam rise.",       category: "mind",         status: "metabolized",  createdAt: Date.now() - 6 * 3600_000, rating: 4, reflection: "Permission to slow down is its own intention." },
    { id: "b3", title: "Hard conversation with Sam",   detail: "Tension softened once I named what I needed.", category: "relationship", status: "metabolized",  createdAt: Date.now() - 28 * 3600_000, rating: 5, reflection: "Honesty is gentler than I expected." },
    { id: "b4", title: "Afternoon walk between calls", detail: "Sun on my face for nine minutes.",             category: "body",         status: "metabolized",  createdAt: Date.now() - 30 * 3600_000, rating: 3 },
    { id: "b5", title: "Stuck on the proposal draft",  detail: "Re-read it three times, still flat.",          category: "work",         status: "open",         createdAt: Date.now() - 2 * 3600_000 },
  ],
  bmrHistory: Array.from({ length: 12 }, (_, i) => ({
    t: Date.now() - (12 - i) * 86_400_000,
    value: 58 + Math.round(8 * Math.sin(i / 2) + i * 0.6),
  })),
  lastBmr: 74,
};

async function ensureDir(p) { await mkdir(p, { recursive: true }); }

async function main() {
  console.log(`Capturing METABYX screenshots from ${BASE_URL}`);
  await ensureDir(OUT_ROOT);
  const executablePath = findChromiumExecutable();
  const browser = await chromium.launch({ headless: true, executablePath });

  try {
    for (const device of DEVICES) {
      const deviceDir = join(OUT_ROOT, device.name);
      await ensureDir(deviceDir);
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
        reducedMotion: "reduce", // calm: no shimmer / page-rise capture artifacts
      });
      // Seed the local store before any route loads.
      await context.addInitScript((seed) => {
        try {
          window.localStorage.setItem("metabyx:store", JSON.stringify(seed));
        } catch { /* private mode etc — ignore */ }
      }, SEED_PAYLOAD);
      const page = await context.newPage();
      for (const shot of SHOTS) {
        const url = new URL(shot.path, BASE_URL).toString();
        process.stdout.write(`  ${device.name}  ${shot.slug.padEnd(14)} ${url}\n`);
        await page.goto(url, { waitUntil: "networkidle" });
        try { await page.waitForSelector(shot.wait, { timeout: 3000 }); } catch { /* best-effort */ }
        // Settle: one extra frame so any animate-rise has finished.
        await page.waitForTimeout(350);
        const out = join(deviceDir, `${shot.slug}.png`);
        await page.screenshot({ path: out, fullPage: false });
      }
      await context.close();
    }
    await writeContactSheet();
    console.log(`\nDone → ${OUT_ROOT}`);
    console.log(`Contact sheet → ${OUT_ROOT}/index.html`);
  } finally {
    await browser.close();
  }
}

async function writeContactSheet() {
  const cards = DEVICES.map((d) => {
    const tiles = SHOTS.map(
      (s) => `<figure><img src="./${d.name}/${s.slug}.png" alt="${s.slug}"><figcaption>${s.slug}</figcaption></figure>`,
    ).join("\n");
    return `<section><h2>${d.name} · ${d.width}×${d.height}@3x</h2><div class="grid">${tiles}</div></section>`;
  }).join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>METABYX · App Store screenshots</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 32px; background: #0c0a1a; color: #f4ecd8; font: 14px/1.5 -apple-system, system-ui, sans-serif; }
  h1 { font-weight: 300; letter-spacing: .02em; margin: 0 0 24px; }
  h2 { font-weight: 400; opacity: .8; margin: 32px 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  figure { margin: 0; background: #15102c; border: 1px solid #ffffff14; border-radius: 16px; overflow: hidden; }
  img { width: 100%; height: auto; display: block; }
  figcaption { padding: 8px 12px; font-size: 12px; opacity: .7; }
</style></head><body>
<h1>METABYX · App Store screenshots</h1>
${cards}
</body></html>`;
  await writeFile(resolve(OUT_ROOT, "index.html"), html, "utf8");
}

main().catch((err) => { console.error(err); process.exit(1); });
