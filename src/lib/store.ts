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

export type MetabyxState = {
  branches: Branch[];
  lastBmr: number;
  bmrHistory: { t: number; value: number }[];
  lastMorningAt?: number;
  lastEveningAt?: number;
};

const KEY = "metabyx:v1";
const EVENT = "metabyx:change";

const defaultState: MetabyxState = {
  branches: [],
  lastBmr: 68,
  bmrHistory: [],
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

export function todaysOpenBranches(state: MetabyxState): Branch[] {
  const todayStart = startOfDay(Date.now());
  return state.branches.filter((b) => b.status === "open" && b.createdAt >= todayStart);
}

export function todaysAllBranches(state: MetabyxState): Branch[] {
  const todayStart = startOfDay(Date.now());
  return state.branches.filter((b) => b.createdAt >= todayStart);
}