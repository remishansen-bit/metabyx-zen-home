# i18n

react-i18next powers METABYX translations.

## Adding a language

1. Create `src/i18n/locales/<code>.json` mirroring the structure of `en.json`.
2. Import it in `src/i18n/index.ts` and add an entry to `resources` + `LANGUAGES`.
3. If the language is RTL (right-to-left), add the code to `RTL_LANGS` — the
   root layout applies `<html dir>` automatically.

## Using translations

```tsx
import { useTranslation } from "react-i18next";

const { t } = useTranslation();
t("nav.home");
t("profile.signedInAs", { email: user.email });
```

The active language is persisted in `localStorage` under `metabyx.lang` and
detected from the browser on first launch.

## Language picker

`<LanguageSelector />` (in `src/components/LanguageSelector.tsx`) is mounted
inside Settings. It switches the language and triggers the RTL/LTR document
direction update.