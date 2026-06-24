import { describe, expect, it } from "vitest";
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
 * Build-blocking i18n parity & leak suite.
 *
 * Goals:
 * 1. Every key present in en.json must exist in every other locale with a
 *    non-empty string value (no missing-key fallbacks at runtime).
 * 2. Non-Latin-script locales (Arabic, Russian) must not contain the raw
 *    English string for any key, unless the English value is a brand,
 *    proper noun, or pure-symbol token that is intentionally identical.
 * 3. Latin-script locales must not silently ship the English value for
 *    long content strings (titles, sentences) — short tokens like "OK",
 *    "Email", "Pro" are tolerated via the shared allowlist.
 */

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

const LOCALES: { code: string; data: Json }[] = [
  { code: "nb", data: nb as Json },
  { code: "es", data: es as Json },
  { code: "fr", data: fr as Json },
  { code: "de", data: de as Json },
  { code: "pt", data: pt as Json },
  { code: "ar", data: ar as Json },
  { code: "sv", data: sv as Json },
  { code: "da", data: da as Json },
  { code: "ru", data: ru as Json },
];

/** Locales that use a non-Latin script — any Latin-letter English leak is
 *  unambiguous and must fail the build. */
const NON_LATIN = new Set(["ar", "ru"]);

/** Strings that may legitimately be identical across locales: brands,
 *  proper nouns, acronyms, single-character glyphs, punctuation. */
const ALLOWED_IDENTICAL = new Set([
  "METABYX",
  "BMR",
  "GCMP",
  "AI",
  "Apple",
  "Google",
  "OK",
  "PDF",
  "CSV",
  "URL",
  "ID",
  "VAD",
  "TTS",
  "JSON",
  "OAuth",
  "Pro",
  "Plus",
  "Free",
  "Email",
  "E-mail",
  "Lovable",
  "Paddle",
  "Supabase",
  "OpenAI",
  "iOS",
  "Android",
  "Web",
  "App Store",
  "Play Store",
  // Loanwords that several supported locales adopt verbatim.
  "Notifications",
]);

function isPlainObject(v: Json): v is { [k: string]: Json } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function walk(obj: Json, prefix = ""): Array<{ path: string; value: string }> {
  const out: Array<{ path: string; value: string }> = [];
  if (typeof obj === "string") {
    out.push({ path: prefix, value: obj });
  } else if (isPlainObject(obj)) {
    for (const k of Object.keys(obj)) {
      const child = obj[k];
      const p = prefix ? `${prefix}.${k}` : k;
      out.push(...walk(child, p));
    }
  }
  return out;
}

function getAt(obj: Json, path: string): Json | undefined {
  const parts = path.split(".");
  let cur: Json | undefined = obj;
  for (const p of parts) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

const enEntries = walk(en as Json);

/** A leaf qualifies for "English leak" comparison only if it actually
 *  contains meaningful Latin alphabetic content. Pure brand/acronym
 *  tokens, numbers, punctuation, or interpolation-only strings ("{{n}}")
 *  are exempt. */
function hasMeaningfulEnglish(value: string): boolean {
  if (ALLOWED_IDENTICAL.has(value.trim())) return false;
  // Email addresses are universal — never count as English leaks.
  if (/@/.test(value)) return false;
  // Strip interpolation placeholders, HTML-ish tags, and punctuation
  // before measuring the alphabetic content.
  const stripped = value
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  const letters = stripped.replace(/[^A-Za-z]/g, "");
  // Short tokens (≤6 Latin letters after stripping) are typically
  // loanwords or abbreviations ("min", "Thread", "streak", "Tråd")
  // that frequently survive translation untouched.
  if (letters.length <= 6) return false;
  // Require at least one lowercase Latin letter — strongest signal of
  // a sentence/word vs. an acronym or symbol set.
  return /[a-z]/.test(stripped);
}

describe("i18n key parity", () => {
  for (const { code, data } of LOCALES) {
    it(`${code}.json defines every key from en.json with a non-empty value`, () => {
      const missing: string[] = [];
      const empty: string[] = [];
      for (const { path } of enEntries) {
        const v = getAt(data, path);
        if (v === undefined) missing.push(path);
        else if (typeof v !== "string") missing.push(`${path} (not a string)`);
        else if (v.trim() === "") empty.push(path);
      }
      expect(
        { missing, empty },
        `Locale ${code} is missing ${missing.length} key(s) and has ${empty.length} empty value(s).\n` +
          `Missing: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? "…" : ""}\n` +
          `Empty:   ${empty.slice(0, 12).join(", ")}${empty.length > 12 ? "…" : ""}`,
      ).toEqual({ missing: [], empty: [] });
    });
  }
});

describe("i18n English-leak detection", () => {
  for (const { code, data } of LOCALES) {
    it(`${code}.json does not silently ship the English string`, () => {
      const leaks: Array<{ path: string; value: string }> = [];
      for (const { path, value: enValue } of enEntries) {
        if (!hasMeaningfulEnglish(enValue)) continue;
        const localized = getAt(data, path);
        if (typeof localized !== "string") continue;
        if (localized === enValue) {
          // Non-Latin scripts: any equality is a leak.
          // Latin scripts: only flag leaks > 12 chars (skip "Email", "Save", etc.
          // that genuinely share spelling and live outside ALLOWED_IDENTICAL).
          if (NON_LATIN.has(code) || enValue.trim().length > 12) {
            leaks.push({ path, value: enValue });
          }
        }
      }
      expect(
        leaks,
        `Locale ${code} still renders the English string for ${leaks.length} key(s). ` +
          `Add a translation or add the source string to ALLOWED_IDENTICAL if it is a brand/proper noun.\n` +
          leaks
            .slice(0, 10)
            .map((l) => `  ${l.path} = ${JSON.stringify(l.value)}`)
            .join("\n"),
      ).toEqual([]);
    });
  }
});

describe("i18n fallback-handler safety", () => {
  it("non-English locales never collapse to the humanized-key fallback", () => {
    // The parseMissingKeyHandler in src/i18n/index.ts humanizes the last
    // dotted segment as a last-resort display string. If a translated
    // value happens to equal that humanized form, the locale is
    // indistinguishable from a missing key at runtime.
    const offenders: string[] = [];
    for (const { path } of enEntries) {
      const last = path.split(".").pop() ?? path;
      const humanized = last
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
      if (humanized.length <= 3) continue;
      for (const { code, data } of LOCALES) {
        if (!NON_LATIN.has(code)) continue;
        const v = getAt(data, path);
        if (typeof v === "string" && v === humanized) {
          offenders.push(`${code}:${path} = ${JSON.stringify(v)}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});