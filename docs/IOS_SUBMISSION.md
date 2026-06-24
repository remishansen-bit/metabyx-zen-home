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

1. Place `resources/icon.png` (1024×1024) and `resources/splash.png`
   (2732×2732, artwork inside ~1200×1200 safe area).
2. `bunx @capacitor/assets generate --ios` writes every required size
   into `ios/App/App/Assets.xcassets/`.
3. Splash background is `#0F0A22` (METABYX deep indigo) — set in
   `capacitor.config.ts`.

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

## Future: native rewrite (Expo / React Native)

If we later need deep native features (HealthKit, rich background
tasks, richer haptics), the next step is a separate Expo project that
consumes a shared `@metabyx/core` package (types, store, server-fn
clients). Multi-week effort — out of scope for this submission. The
Capacitor wrap above ships today and lets us migrate incrementally.