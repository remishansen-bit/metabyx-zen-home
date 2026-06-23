import { useEffect, useState, useSyncExternalStore } from "react";

export type Branch = {
  id: string;
  title: string;
  detail: string;
  category: "mind" | "body" | "relationship" | "work" | "spirit";
  status: "open" | "metabolized";
  createdAt: number;
  reflection?: string;
  rating?: number; // 1..5
};

export type EmotionEvent = {
  id: string;
  t: number;
  phase: number; // 0..4 (GCMP phase index)
  primaryEmotion:
    | "sadness" | "anxiety" | "anger" | "guilt" | "shame" | "fear"
    | "grief" | "hope" | "relief" | "tenderness" | "neutral";
  intensity: "low" | "medium" | "high";
  tears: boolean;
  tearsConfidence: number;
  summary: string;
  sourceText?: string;
};

export type MetabyxState = {
  branches: Branch[];
  lastBmr: number;
  bmrHistory: { t: number; value: number }[];
  emotionEvents?: EmotionEvent[];
  lastMorningAt?: number;
  lastEveningAt?: number;
};

const KEY = "metabyx:v1";
const EVENT = "metabyx:change";

const defaultState: MetabyxState = {
  branches: [],
  lastBmr: 68,
  bmrHistory: [],
  emotionEvents: [],
};

function read(): MetabyxState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...(JSON.parse(raw) as MetabyxState) };
  } catch {
    return defaultState;
  }
}

function write(state: MetabyxState) {
  window.localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useMetabyx() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const state = useSyncExternalStore(
    subscribe,
    () => {
      const raw = window.localStorage.getItem(KEY);
      return raw ?? "__default__";
    },
    () => "__default__",
  );
  void state;

  const value = hydrated ? read() : defaultState;
  return value;
}

export function computeBmr(state: MetabyxState): number {
  const todayStart = startOfDay(Date.now());
  const todays = state.branches.filter((b) => b.createdAt >= todayStart);
  const total = todays.length;
  const metabolized = todays.filter((b) => b.status === "metabolized").length;
  const ratingsAvg =
    todays
      .filter((b) => typeof b.rating === "number")
      .reduce((acc, b) => acc + (b.rating ?? 0), 0) /
    Math.max(todays.filter((b) => typeof b.rating === "number").length, 1);

  const base = 60;
  const progress = total === 0 ? 0 : (metabolized / total) * 28;
  const awareness = total > 0 ? 6 : 0;
  const quality = ratingsAvg ? (ratingsAvg - 3) * 2 : 0;
  const value = Math.max(40, Math.min(99, Math.round(base + progress + awareness + quality)));
  return value;
}

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addBranches(items: Omit<Branch, "id" | "createdAt" | "status">[]) {
  const state = read();
  const created: Branch[] = items.map((b) => ({
    ...b,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: "open",
  }));
  const next: MetabyxState = {
    ...state,
    branches: [...created, ...state.branches],
    lastMorningAt: Date.now(),
  };
  next.lastBmr = computeBmr(next);
  next.bmrHistory = [...state.bmrHistory.slice(-30), { t: Date.now(), value: next.lastBmr }];
  write(next);
}

export function metabolizeBranch(id: string, rating: number, reflection: string) {
  const state = read();
  const next: MetabyxState = {
    ...state,
    branches: state.branches.map((b) =>
      b.id === id ? { ...b, status: "metabolized", rating, reflection } : b,
    ),
    lastEveningAt: Date.now(),
  };
  next.lastBmr = computeBmr(next);
  next.bmrHistory = [...state.bmrHistory.slice(-30), { t: Date.now(), value: next.lastBmr }];
  write(next);
}

export function logEmotionEvent(event: Omit<EmotionEvent, "id" | "t">) {
  const state = read();
  const ev: EmotionEvent = {
    ...event,
    id: crypto.randomUUID(),
    t: Date.now(),
  };
  const list = [...(state.emotionEvents ?? []), ev].slice(-120);
  write({ ...state, emotionEvents: list });
}

export function recentEmotionEvents(state: MetabyxState, limit = 12): EmotionEvent[] {
  return [...(state.emotionEvents ?? [])].reverse().slice(0, limit);
}

export function todaysOpenBranches(state: MetabyxState): Branch[] {
  const todayStart = startOfDay(Date.now());
  return state.branches.filter((b) => b.status === "open" && b.createdAt >= todayStart);
}

export function todaysAllBranches(state: MetabyxState): Branch[] {
  const todayStart = startOfDay(Date.now());
  return state.branches.filter((b) => b.createdAt >= todayStart);
}

/**
 * Replace the persisted Metabyx state from a previously-exported JSON payload.
 * Merges branches by id (newer createdAt wins) and concatenates BMR history,
 * so importing on top of an existing library never deletes local data.
 */
export function importMetabyxJson(raw: unknown): {
  importedBranches: number;
  importedHistory: number;
  mergedBranches: number;
  skippedBranches: number;
  totalBranches: number;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("This file isn't a Metabyx export.");
  }
  const payload = raw as Partial<MetabyxState> & { app?: string; version?: number };
  if (payload.app && payload.app !== "metabyx") {
    throw new Error("This file was exported by a different app.");
  }
  if (!("branches" in payload) && !("bmrHistory" in payload)) {
    throw new Error("No branches or BMR history found in this file.");
  }
  if (payload.version && payload.version > 1) {
    throw new Error(
      `This export is from a newer version (v${payload.version}). Update the app first.`,
    );
  }
  const incomingBranches = Array.isArray(payload.branches) ? payload.branches : [];
  const incomingHistory = Array.isArray(payload.bmrHistory) ? payload.bmrHistory : [];
  const state = read();
  const byId = new Map<string, Branch>();
  for (const b of state.branches) byId.set(b.id, b);
  const validCats = new Set(["mind", "body", "relationship", "work", "spirit"]);
  let merged = 0;
  let skipped = 0;
  for (const b of incomingBranches) {
    if (
      !b ||
      typeof b !== "object" ||
      typeof (b as Branch).id !== "string" ||
      typeof (b as Branch).title !== "string" ||
      typeof (b as Branch).createdAt !== "number" ||
      !validCats.has((b as Branch).category)
    ) {
      skipped += 1;
      continue;
    }
    const existing = byId.get(b.id);
    if (!existing || (b.createdAt ?? 0) >= existing.createdAt) {
      byId.set(b.id, b);
      merged += 1;
    }
  }
  const branches = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  const history = [...state.bmrHistory, ...incomingHistory]
    .filter((p) => p && typeof p.t === "number" && typeof p.value === "number")
    .sort((a, b) => a.t - b.t)
    .slice(-60);
  const next: MetabyxState = {
    ...state,
    branches,
    bmrHistory: history,
    lastBmr: typeof payload.lastBmr === "number" ? payload.lastBmr : state.lastBmr,
  };
  next.lastBmr = computeBmr(next);
  write(next);
  return {
    importedBranches: incomingBranches.length,
    importedHistory: incomingHistory.length,
    mergedBranches: merged,
    skippedBranches: skipped,
    totalBranches: branches.length,
  };
}

/**
 * Pure helper used by the Home dashboard tiles. Kept here (not inlined in the
 * route) so it can be unit-tested without rendering React.
 *
 * - `weeklyDelta`: current value minus the BMR baseline. Baseline is the last
 *   reading *before* the 7-day window when one exists, otherwise the oldest
 *   reading inside the window, otherwise the oldest known reading.
 * - `streak`: count of consecutive history points (walking from newest back)
 *   whose value did not drop. `current` is already the last entry of
 *   `history` in normal app flow, so we never add it on top.
 * - `latest`: the supplied `current` BMR.
 */
export function computeBmrStats(
  history: { t: number; value: number }[],
  current: number,
  now: number = Date.now(),
): { weeklyDelta: number; streak: number; latest: number } {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  let beforeWindow: { t: number; value: number } | undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].t < weekAgo) {
      beforeWindow = history[i];
      break;
    }
  }
  const inWindow = history.find((p) => p.t >= weekAgo);
  const baseline =
    beforeWindow?.value ?? inWindow?.value ?? history[0]?.value ?? current;

  let streak = 0;
  if (history.length >= 2) {
    for (let i = history.length - 1; i > 0; i--) {
      if (history[i].value >= history[i - 1].value) streak += 1;
      else break;
    }
  } else if (history.length === 1) {
    streak = 1;
  }

  return { weeklyDelta: current - baseline, streak, latest: current };
}