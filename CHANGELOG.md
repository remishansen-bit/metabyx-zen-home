# Changelog

## 1.0.0 — 2026-06-24

First App Store submission build.

### Highlights
- Full GCMP guided session flow (Identify → Friction → Path → Walkthrough → Closing).
- Voice recorder with calibration, VAD, pitch/stability meters and localized history.
- Library, Circles, Branch detail, Emotion insight, Subscription history.
- Crisis mode, Morning & Evening check-ins, Paywall with analytics.
- Full i18n in 10 languages (en, nb, es, fr, de, pt, ar, sv, da, ru) with build-blocking parity + leak tests.
- RTL Arabic layout verified with Playwright spec + visual snapshots.
- Capacitor iOS wrap (`com.metabyx.app`), splash + permissions configured.
- Test-mode payment banner gated behind `VITE_SHOW_TEST_PAYMENT_BANNER`.

### Build / CI
- Vitest suite + i18n parity workflow on every PR.
- iOS smoke build workflow (`macos-14`, unsigned `xcodebuild`).
- Lighthouse + security scan workflows.