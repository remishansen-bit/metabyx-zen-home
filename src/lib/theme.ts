/**
 * Theme runtime: persists the user's chosen appearance across launches by
 * mirroring `profile.preferences.theme` into localStorage and applying a
 * `theme-<name>` class to <html>. Settings can call `applyTheme` for a live
 * preview before the profile sync completes.
 */
export type ThemeName = "dusk" | "indigo" | "rose";

const KEY = "metabyx:theme";
const VALID: ThemeName[] = ["dusk", "indigo", "rose"];

export function readStoredTheme(): ThemeName {
  if (typeof window === "undefined") return "dusk";
  const v = window.localStorage.getItem(KEY);
  return VALID.includes(v as ThemeName) ? (v as ThemeName) : "dusk";
}

export function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const t of VALID) root.classList.remove(`theme-${t}`);
  root.classList.add(`theme-${theme}`);
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable — preview still works for the session */
  }
}

export function initThemeFromStorage() {
  applyTheme(readStoredTheme());
}