# Full i18n completion — phased plan

This work is too large for a single turn (10+ component/route files, 100+ new keys × 10 languages = 1000+ strings, plus a new test harness and Playwright spec). I'll do it in 4 sequential phases. Each phase is independently shippable; approve and I'll execute them one per turn.

## Phase 1 — String audit + key extraction (no translation yet)

Goal: every user-facing English string in app code is replaced by a `t("…")` call, with new keys added to `en.json` only. Other locales fall back to English (already wired) so nothing breaks.

Files in scope:
- `src/components/voice-recorder.tsx`
- `src/components/PaywallAnalyticsCard.tsx`
- `src/components/PaywallSheet.tsx`
- `src/components/subscription-card.tsx`
- `src/components/SubscriptionHistory.tsx`
- `src/components/PaymentTestModeBanner.tsx`
- `src/components/emotion-insight.tsx`
- `src/routes/session.tsx`
- `src/routes/library.tsx`
- `src/routes/circles.tsx`, `src/routes/circles.$id.tsx`
- `src/routes/branch.$id.tsx`
- `src/routes/crisis.tsx`
- `src/routes/morning.tsx`, `src/routes/evening.tsx`
- `src/routes/index.tsx` (any remaining)
- `src/routes/settings.tsx` (Dialog / Toggle hardcoded labels)
- `src/lib/feedback.ts` toast titles where author-provided
- Auth error message strings in `src/lib/auth.tsx`

New `en.json` namespaces: `session`, `library`, `branch`, `voice`, `paywall`, `subscription`, `morning`, `evening`, `emotion`, `dialog`.

Deliverable: typecheck-clean app, all keys present in `en.json`, all hardcoded strings replaced.

## Phase 2 — Translate Phase 1 keys into 9 locales

Generate translations for every key added in Phase 1 across `nb / es / fr / de / pt / ar / sv / da / ru`, keeping the calm/supportive tone. Done as a single Python merge script per locale.

Deliverable: 9 locale files fully cover the new keys with no English fallback.

## Phase 3 — Build-blocking missing-key + English-leak test

Add `tests/i18n/no-missing-keys.test.ts` (Vitest) that:
1. Loads every locale JSON.
2. Walks `en.json` recursively and asserts every key exists in every other locale.
3. For each non-English locale, asserts no leaf value equals the English leaf value (except whitelisted brand/proper-noun tokens like `METABYX`, `BMR`, email addresses).
4. Spies on i18next's `missingKeyHandler` during a render-smoke and fails if invoked.

Wire into `package.json` `test` script and into the existing CI workflows so it blocks PRs.

Deliverable: `bunx vitest run tests/i18n` passes; intentionally breaking a key (delete one from `fr.json`) fails the run.

## Phase 4 — Expand Playwright RTL Arabic spec

Extend `tests/e2e/rtl-arabic.spec.ts` to:
- Switch language to `ar` via the LanguageSelector and assert `<html dir="rtl" lang="ar">`.
- On Home: assert translated greeting, tab-bar labels (Home/Check-in/Guided/Circles/Library/Profile in Arabic), and that the tab bar visually flows right→left (check first child's `getBoundingClientRect().x` > last child's).
- Navigate to Settings: assert translated section titles (`Daily reminders`, `Privacy`, `Legal & support`), assert the back chevron sits on the right edge, assert the new Logout button label renders in Arabic.
- Screenshot each assertion checkpoint into `tests/e2e/__screenshots__/rtl-ar-*.png` for review.

Deliverable: spec runs green against the live preview.

## Technical notes

- i18n init in `src/i18n/index.ts` already has `fallbackLng: "en"` and a `parseMissingKeyHandler` that humanizes dotted keys; Phase 3's test will tighten that to also error in test mode.
- Tone glossary (gentle / calm / second-person, no exclamation marks, no marketing language) will be reused from existing translations in the Phase 2 generation script.
- No DB / Cloud / iOS changes in any phase.

## Ask

Reply "go phase 1" (or 1+2, etc.) and I'll execute. If you want me to compress Phase 1+2 into one turn for a specific subset (e.g. just voice-recorder + session + crisis), say which files and I'll batch those.
