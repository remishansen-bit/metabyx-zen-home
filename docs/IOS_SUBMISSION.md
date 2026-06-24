# METABYX — iOS / App Store submission

This project is a TanStack Start web app. We ship it to the App Store by
wrapping it with **Capacitor**, which embeds the built web bundle in a
native iOS shell. No Expo / React Native rewrite is required.

If you'd rather rewrite the UI in React Native + Expo for a fully native
app, see the "Future: native rewrite" section at the bottom.

## 1. Prerequisites (one-time)

- macOS with **Xcode 15+** and the Command Line Tools installed.
- Apple Developer account (USD 99/year) and access to App Store Connect.
- An App ID matching `capacitor.config.ts` → `appId` (default
  `com.metabyx.app`). Create it under
  *Apple Developer → Certificates, IDs & Profiles → Identifiers*.
- An App record in App Store Connect with the same bundle id.
- (Optional, for cloud builds) An **Expo EAS** account — EAS Build supports
  Capacitor / native iOS projects too; see step 5.

## 2. Generate the iOS project

```bash
bun install
bun run build                # web bundle → dist/
bunx cap add ios             # one-time; creates ios/ Xcode project
bunx cap sync ios            # after every web build
```

Commit the generated `ios/` directory. From then on every web change is
just `bun run build && bunx cap sync ios`.

## 3. App icons & splash screen

1. Place `resources/icon.png` (1024×1024, no transparency, no rounded corners — iOS masks it) and `resources/splash.png` (2732×2732, artwork inside the centered ~1200×1200 safe area).
2. Generate every required size:
   ```bash
   bun run ios:assets
   ```
   Writes icons + launch images into `ios/App/App/Assets.xcassets/`.
3. Splash background is `#0F0A22` (METABYX deep indigo) — declared in `capacitor.config.ts` under `plugins.SplashScreen` and `ios.backgroundColor`. The splash auto-hides after 1.2s.

## 3b. iOS permissions (Info.plist)

Add the following keys to `ios/App/App/Info.plist` after `cap add ios`. App Store review rejects builds that prompt for these without a description string:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>METABYX uses the microphone to transcribe your spoken check-ins.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>METABYX transcribes your voice locally and via our secure API to turn spoken check-ins into text.</string>
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

Camera, contacts, location, and HealthKit are NOT used — do not add their keys.

## 4. Versioning

- Web/PWA version: `package.json` → `version`.
- iOS marketing version: Xcode → *App → General → Version*
  (CFBundleShortVersionString).
- iOS build number (must increase per upload): Xcode → *Build*
  (CFBundleVersion).

## 5. Build & submit

### Option A — Xcode (simplest)

1. `bunx cap open ios`
2. App target → *Signing & Capabilities* → pick your Team.
3. Target = **Any iOS Device (arm64)**.
4. *Product → Archive*.
5. Organizer → **Distribute App → App Store Connect → Upload**.
6. App Store Connect (≈10 min later): attach screenshots from step 6,
   fill metadata, submit for review.

### Option B — EAS Build (CI / no local Xcode)

EAS will build the Capacitor `ios/` project as long as it's committed.

1. `npm i -g eas-cli && eas login`
2. `eas init --id <eas-project-id>`
3. `eas.json`:

    ```json
    {
      "build": {
        "production": {
          "ios": {
            "image": "macos-sonoma-14.6-xcode-16.0",
            "scheme": "App",
            "workingDirectory": "ios/App"
          }
        }
      },
      "submit": {
        "production": { "ios": { "ascAppId": "<your App Store Connect app id>" } }
      }
    }
    ```

4. `eas build --platform ios --profile production`
5. `eas submit --platform ios --latest`

Note: this is a **native** iOS build, not Expo's managed RN workflow.
`app.json` / `app.config.ts` belong to managed Expo and are not used
here — Capacitor's source of truth is `capacitor.config.ts`.

## 6. App Store screenshots

The capture script produces **empty** + **populated** variants for
iPhone 16 and iPhone 16 Pro at @3x:

```bash
bun run dev                       # terminal A
bun run appstore:screenshots      # terminal B
# → /mnt/documents/appstore/iphone-16/{populated,empty}/*.png
# → /mnt/documents/appstore/iphone-16-pro/{populated,empty}/*.png
# → /mnt/documents/appstore/index.html  (contact sheet)
```

Apple requires the **6.7" display** set (iPhone 15/16 Pro Max,
1290×2796). Add to `DEVICES` in `scripts/appstore-screenshots.mjs`:

```js
{ name: "iphone-16-pro-max", width: 430, height: 932 }
```

(Script captures at DPR 3 → 1290×2796 native.)

## 7. Privacy & compliance checklist

- App Store Connect → *App Privacy*: declare email + usage analytics +
  voice transcripts (if `useVoiceInput` is enabled).
- `Info.plist`: add `NSMicrophoneUsageDescription` =
  *"METABYX uses the microphone to transcribe your check-ins."*
- Export compliance: HTTPS only → answer "uses encryption / exempt".
- Privacy Policy URL is **required** in App Store Connect.

## 8. End-to-end build smoke test

Run before every TestFlight upload:

```bash
bun install
bun run build               # web bundle
bunx cap sync ios           # copy dist/ + plugins into Xcode project
bunx cap doctor             # verifies plugin + native versions match
open ios/App/App.xcworkspace
# In Xcode: Product → Build, then Product → Archive.
```

If `cap sync` warns about a plugin version mismatch, run
`bun add @capacitor/core@latest @capacitor/ios@latest` and re-sync.

## Quick command cheatsheet

| Task | Command |
| --- | --- |
| One-time iOS project scaffolding | `bun run ios:add` |
| Generate icons + splash from `resources/` | `bun run ios:assets` |
| Rebuild web + sync into Xcode | `bun run ios:sync` |
| Open Xcode workspace | `bun run ios:open` |
| App Store screenshots (empty + populated) | `bun run appstore:screenshots` |

## CI: iOS smoke test

`.github/workflows/ios-smoke.yml` runs on every PR that touches
`capacitor.config.ts`, `src/`, `public/`, `ios/`, or the workflow itself.
It runs on `macos-14`, ensures the `ios/` project exists, runs
`cap sync ios`, installs CocoaPods, and runs an unsigned `xcodebuild`
against the iOS simulator. Native config regressions (missing keys,
broken plugin install, bad bundle id) fail the PR before merge.

No signing certs are needed — the smoke build sets
`CODE_SIGNING_ALLOWED=NO`. Distribution builds (Archive → Upload) still
happen on your Mac or via EAS.

## Final pre-submission checklist (run on a Mac)

These steps require macOS + Xcode and cannot run in the Lovable sandbox.
Run them in order from a clean clone:

```bash
bun install
bun run build
bun run ios:add            # only the first time
bun run ios:assets         # after placing resources/icon.png + resources/splash.png
bun run ios:sync           # copies dist/ + plugin changes into ios/
bunx cap doctor            # verifies plugin/native versions match
open ios/App/App.xcworkspace
```

In Xcode:

1. Target **App** → **Signing & Capabilities** → pick your Team, confirm
   the bundle id matches `capacitor.config.ts` (`com.metabyx.app`).
2. Verify `ios/App/App/Info.plist` contains the three keys from
   "iOS permissions (Info.plist)" above (mic, speech, encryption).
3. Bump the build number (CFBundleVersion) — every TestFlight upload
   needs a higher number than the last.
4. Destination = **Any iOS Device (arm64)** → **Product → Archive**.
5. Organizer → **Distribute App → App Store Connect → Upload**.
6. App Store Connect (≈10 min later): attach the screenshots from
   `/mnt/documents/appstore/`, fill metadata, and submit for review.
## Future: native rewrite (Expo / React Native)

If we later need deep native features (HealthKit, rich background
tasks, richer haptics), the next step is a separate Expo project that
consumes a shared `@metabyx/core` package (types, store, server-fn
clients). Multi-week effort — out of scope for this submission. The
Capacitor wrap above ships today and lets us migrate incrementally.