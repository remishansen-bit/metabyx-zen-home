import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import nb from "./locales/nb.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import pt from "./locales/pt.json";
import ar from "./locales/ar.json";
import sv from "./locales/sv.json";
import da from "./locales/da.json";
import ru from "./locales/ru.json";

/**
 * Supported languages. To add a new one:
 *   1. Drop a JSON file in src/i18n/locales/<code>.json mirroring en.json.
 *   2. Import it above and add an entry to `resources` and `LANGUAGES`.
 *   3. If the script is RTL, add the code to `RTL_LANGS`.
 */
export const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "nb", label: "Norwegian (Bokmål)", native: "Norsk bokmål" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "sv", label: "Swedish", native: "Svenska" },
  { code: "da", label: "Danish", native: "Dansk" },
  { code: "ru", label: "Russian", native: "Русский" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const RTL_LANGS: ReadonlyArray<LanguageCode> = ["ar"];

export const isRtl = (code: string) =>
  RTL_LANGS.includes(code.split("-")[0] as LanguageCode);

const resources = {
  en: { translation: en },
  nb: { translation: nb },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  ar: { translation: ar },
  sv: { translation: sv },
  da: { translation: da },
  ru: { translation: ru },
};

let initialized = false;

export function initI18n() {
  if (initialized) return i18n;
  initialized = true;

  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: "en",
      supportedLngs: LANGUAGES.map((l) => l.code),
      load: "languageOnly",
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        caches: ["localStorage"],
        lookupLocalStorage: "metabyx.lang",
      },
      returnNull: false,
      // When a key is missing in the active locale, react-i18next falls back
      // to `fallbackLng` ("en") automatically. We additionally:
      //   - In dev: log a warning so missing keys are surfaced loudly.
      //   - In prod: stay silent and return the English string so users never
      //     see raw key paths like `home.greetingMorning`.
      saveMissing: import.meta.env.DEV,
      missingKeyHandler: (lngs, _ns, key, fallbackValue) => {
        if (!import.meta.env.DEV) return;
        // eslint-disable-next-line no-console
        console.warn(
          `[i18n] missing translation: key="${key}" lng="${lngs.join(",")}" fallback="${fallbackValue ?? key}"`,
        );
      },
      parseMissingKeyHandler: (key) => {
        // Last-resort display string: humanize the dotted key so we never
        // render "settings.morningReminder" in the UI.
        const last = key.split(".").pop() ?? key;
        return last.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
      },
    });

  return i18n;
}

export function applyDocumentDirection(code: string) {
  if (typeof document === "undefined") return;
  const lang = code.split("-")[0];
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
}

export default i18n;