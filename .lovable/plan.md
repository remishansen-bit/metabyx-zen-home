You picked "all" across the board, so I'll execute in three checked-in steps rather than one giant unreviewable change. Each step ends with a working app you can preview before I move on.

## Step 1 — Shared layout & typography system

Goal: every screen uses the same primitives, so spacing/scroll/typography drift becomes impossible.

New files in `src/components/layout/`:
- `PhoneFrame.tsx` — outer 100dvh container, safe-area insets, max-width capped at iPhone 16 Pro width on larger viewports.
- `Screen.tsx` — `<Screen header={…} footer={…}>` grid: fixed header row, scrollable main, fixed footer row. Inner scroll only, frame stays put.
- `Section.tsx` / `Stack.tsx` — vertical rhythm primitives using spacing tokens.
- `ScreenTitle.tsx`, `ScreenSubtitle.tsx`, `Eyebrow.tsx` — typography primitives bound to tokens.

Tokens added to `src/styles.css` under `@theme`:
- Spacing scale: `--space-screen-x` (20px), `--space-screen-y` (24px), `--space-section` (32px), `--space-stack` (12px / 16px / 24px).
- Type scale: `--text-display`, `--text-title`, `--text-body`, `--text-caption` with matching line-heights.
- Motion tokens: `--ease-calm`, `--dur-fast` (160ms), `--dur-base` (240ms), `--dur-slow` (400ms). All respect `prefers-reduced-motion`.

Refactor pass on Home, Library, Profile/Tracker, Check-in, Reflections, Voice, Onboarding to consume `<Screen>` — no business-logic edits.

## Step 2 — Loading, empty states, animations

- `src/components/feedback/Skeleton.tsx` — single shimmer primitive, respects reduced-motion. Replace ad-hoc skeletons.
- `src/components/feedback/EmptyState.tsx` — illustration slot + title + body + primary action. Apply to Library, Check-ins, Reflections, Tracker history, Circles (locked).
- Page transitions: `<ScreenTransition>` wrapper using framer-motion `AnimatePresence` with calm fade+rise (8px, 240ms). Disabled under `prefers-reduced-motion`.
- Skeleton timing budget: min 120ms (no flash), graceful crossfade to content or empty state.
- Audit and remove layout-shifting spinners; replace with skeletons that match final layout.

## Step 3 — App Store screenshot set

Playwright script `scripts/appstore-screenshots.ts` runs against the local preview at iPhone 16 (393×852) and iPhone 16 Pro (402×874) viewports, dpr 3.

Captures 6 hero shots per device using mocked-but-realistic data (deterministic seed, no real account needed):
1. Onboarding welcome
2. Daily check-in (mid-flow)
3. GCMP voice screen (active)
4. Library (populated)
5. Profile / Tracker (with data)
6. Reflections

Output saved to `/mnt/documents/appstore/<device>/NN-<name>.png` plus a combined `/mnt/documents/appstore/index.html` contact sheet for quick review. I'll attach them with `<presentation-artifact>` tags.

## Technical notes

- No business-logic or backend changes anywhere.
- All hardcoded `px-4`, `pt-6`, ad-hoc `min-h-screen` get replaced by primitives; semantic tokens only — no raw color classes introduced.
- Reduced-motion: every new animation gated on `useReducedMotion()` from framer-motion.
- Existing Playwright suites (`height-focus`, `library-empty`, `library-visual`, `reduced-motion`) continue to pass; baselines refreshed via `scripts/update-visual-baselines.sh` only for screens whose layout intentionally changed.
- I'll check in with you after Step 1 before starting Step 2, and after Step 2 before Step 3, so you can course-correct early.

Approve and I'll start on Step 1.