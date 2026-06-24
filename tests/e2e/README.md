# METABYX E2E

## Run locally

```bash
bun run e2e:install     # one-time: download Chromium
bun run e2e              # run all specs
bunx playwright test a11y --headed   # debug a single spec
```

## Visual regression baselines

Screenshot tests live in `visual-regression.spec.ts`. When you intentionally
change a screen's layout, update the baselines locally:

```bash
./scripts/update-visual-baselines.sh           # all visual specs
./scripts/update-visual-baselines.sh auth      # filter by name
```

The PNG baselines are stored next to the spec under
`tests/e2e/visual-regression.spec.ts-snapshots/`. Commit the updated PNGs
together with the UI change.

CI runs in headless mode with `maxDiffPixelRatio: 0.02` and **fails on any
unexpected diff**. On failure, the workflow uploads `playwright-report/`
and `test-results/` (screenshots + videos + traces) as artifacts so you
can inspect what changed.

## Auth-gated specs

Specs that require a signed-in user read `E2E_EMAIL` / `E2E_PASSWORD` and
skip when those env vars are unset, so the suite stays runnable on a fresh
checkout.