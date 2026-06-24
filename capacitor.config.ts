import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the iOS wrap of METABYX.
 *
 * The web build is loaded from `dist/` — Vite's default output. To produce
 * an .ipa:
 *   1. bun run build
 *   2. bunx cap add ios          (one-time; creates ios/ Xcode project)
 *   3. bunx cap sync ios         (after every web build)
 *   4. bunx cap open ios         (Xcode → Product > Archive → Distribute)
 *
 * See docs/IOS_SUBMISSION.md for the full submission walkthrough.
 */
const config: CapacitorConfig = {
  appId: "com.metabyx.app",
  appName: "METABYX",
  webDir: "dist",
  ios: {
    contentInset: "always",
    backgroundColor: "#0F0A22",
    limitsNavigationsToAppBoundDomains: true,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;