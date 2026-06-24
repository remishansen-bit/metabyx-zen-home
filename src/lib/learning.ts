/**
 * Personal-learning store. We watch how the user's preferences and reminder
 * behaviour evolve over time and persist a compact, on-device summary the
 * Profile screen can render as "what the app has learned about you".
 *
 * All state is local — no cloud sync, no analytics. The point is that the
 * insights live next to the user's branches and disappear when they hit
 * Delete on-device data.
 */

export type PrefEvent = { t: number; key: string; value: unknown };
export type ReminderEvent = { t: number; slot: "morning" | "evening"; action: "fired" | "skipped" };

export type LearningState = {
  prefChanges: PrefEvent[];
  reminderHistory: ReminderEvent[];
};

export type LearningInsights = {
  totalPrefChanges: number;
  mostTunedPref: string | null;
  preferredReminderSlot: "morning" | "evening" | "balanced" | "none";
  remindersFired: number;
  remindersSkipped: number;
  consistency: number; // 0..1, fired / (fired + skipped)
  lastUpdated: number | null;
};

const KEY = "metabyx:learning:v1";
const MAX_EVENTS = 200;

const empty: LearningState = { prefChanges: [], reminderHistory: [] };

function read(): LearningState {
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as LearningState) };
  } catch {
    return empty;
  }
}

function write(state: LearningState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("metabyx:learning:change"));
}

export function recordPrefChange(key: string, value: unknown) {
  const state = read();
  const prefChanges = [...state.prefChanges, { t: Date.now(), key, value }].slice(-MAX_EVENTS);
  write({ ...state, prefChanges });
}

export function recordReminder(slot: "morning" | "evening", action: "fired" | "skipped") {
  const state = read();
  const reminderHistory = [
    ...state.reminderHistory,
    { t: Date.now(), slot, action },
  ].slice(-MAX_EVENTS);
  write({ ...state, reminderHistory });
}

export function readLearning(): LearningState {
  return read();
}

export function clearLearning() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("metabyx:learning:change"));
}

/** Derive a small set of human-readable insights from the raw event log. */
export function summarize(state: LearningState = read()): LearningInsights {
  const counts: Record<string, number> = {};
  for (const e of state.prefChanges) counts[e.key] = (counts[e.key] ?? 0) + 1;
  let mostTunedPref: string | null = null;
  let max = 0;
  for (const [k, c] of Object.entries(counts)) {
    if (c > max) {
      max = c;
      mostTunedPref = k;
    }
  }

  const fired = state.reminderHistory.filter((r) => r.action === "fired");
  const skipped = state.reminderHistory.filter((r) => r.action === "skipped");
  const morning = fired.filter((r) => r.slot === "morning").length;
  const evening = fired.filter((r) => r.slot === "evening").length;

  let preferredReminderSlot: LearningInsights["preferredReminderSlot"] = "none";
  if (fired.length > 0) {
    if (morning > evening * 1.5) preferredReminderSlot = "morning";
    else if (evening > morning * 1.5) preferredReminderSlot = "evening";
    else preferredReminderSlot = "balanced";
  }

  const total = fired.length + skipped.length;
  const consistency = total === 0 ? 0 : fired.length / total;

  const last =
    [...state.prefChanges, ...state.reminderHistory]
      .map((e) => e.t)
      .sort((a, b) => b - a)[0] ?? null;

  return {
    totalPrefChanges: state.prefChanges.length,
    mostTunedPref,
    preferredReminderSlot,
    remindersFired: fired.length,
    remindersSkipped: skipped.length,
    consistency,
    lastUpdated: last,
  };
}