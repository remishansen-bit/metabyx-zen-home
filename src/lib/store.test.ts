import { describe, expect, it } from "vitest";
import { computeBmrStats } from "./store";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("computeBmrStats", () => {
  it("returns zeroed deltas with no history", () => {
    const r = computeBmrStats([], 72, NOW);
    expect(r).toEqual({ weeklyDelta: 0, streak: 0, latest: 72 });
  });

  it("treats a single reading as a streak of one and zero delta", () => {
    const r = computeBmrStats([{ t: NOW, value: 70 }], 70, NOW);
    expect(r).toEqual({ weeklyDelta: 0, streak: 1, latest: 70 });
  });

  it("uses the last reading before the 7-day window as baseline", () => {
    const history = [
      { t: NOW - 10 * DAY, value: 60 }, // baseline (before window)
      { t: NOW - 9 * DAY, value: 62 },  // also before window — more recent one wins
      { t: NOW - 5 * DAY, value: 65 },
      { t: NOW - 1 * DAY, value: 70 },
    ];
    const r = computeBmrStats(history, 70, NOW);
    expect(r.weeklyDelta).toBe(70 - 62);
    expect(r.latest).toBe(70);
  });

  it("falls back to oldest in-window reading when nothing precedes it", () => {
    const history = [
      { t: NOW - 6 * DAY, value: 64 },
      { t: NOW - 1 * DAY, value: 71 },
    ];
    const r = computeBmrStats(history, 71, NOW);
    expect(r.weeklyDelta).toBe(71 - 64);
  });

  it("counts a non-decreasing streak from the newest entry backwards", () => {
    const history = [
      { t: NOW - 5 * DAY, value: 70 },
      { t: NOW - 4 * DAY, value: 68 }, // drop breaks streak here
      { t: NOW - 3 * DAY, value: 69 },
      { t: NOW - 2 * DAY, value: 71 },
      { t: NOW - 1 * DAY, value: 71 }, // equal counts as non-decreasing
    ];
    const r = computeBmrStats(history, 71, NOW);
    expect(r.streak).toBe(3);
  });

  it("breaks streak immediately when the most recent reading dropped", () => {
    const history = [
      { t: NOW - 2 * DAY, value: 80 },
      { t: NOW - 1 * DAY, value: 75 },
    ];
    const r = computeBmrStats(history, 75, NOW);
    expect(r.streak).toBe(0);
  });

  it("returns current as latest even if history is stale", () => {
    const history = [{ t: NOW - 30 * DAY, value: 50 }];
    const r = computeBmrStats(history, 82, NOW);
    expect(r.latest).toBe(82);
    expect(r.weeklyDelta).toBe(82 - 50);
  });
});

// Cold-start / reload scenarios: simulate what the Home tiles see after the
// app boots from localStorage with varying amounts of persisted history.
describe("computeBmrStats — reload scenarios", () => {
  it("cold start with no persisted history shows neutral tiles", () => {
    const persisted: { t: number; value: number }[] = [];
    const current = 68; // defaultState.lastBmr
    const r = computeBmrStats(persisted, current, NOW);
    expect(r).toEqual({ weeklyDelta: 0, streak: 0, latest: 68 });
  });

  it("reload with a single persisted point keeps latest and streak coherent", () => {
    const persisted = [{ t: NOW - 2 * DAY, value: 72 }];
    const r = computeBmrStats(persisted, 72, NOW);
    expect(r.latest).toBe(72);
    expect(r.streak).toBe(1);
    expect(r.weeklyDelta).toBe(0);
  });

  it("reload with only stale history (>7d old) uses oldest as baseline", () => {
    const persisted = [
      { t: NOW - 20 * DAY, value: 55 },
      { t: NOW - 14 * DAY, value: 60 },
    ];
    const r = computeBmrStats(persisted, 60, NOW);
    // most recent before-window entry (60) is the baseline
    expect(r.weeklyDelta).toBe(0);
    expect(r.latest).toBe(60);
  });

  it("reload mid-week recomputes weekly change against pre-window baseline", () => {
    const persisted = [
      { t: NOW - 9 * DAY, value: 64 },
      { t: NOW - 6 * DAY, value: 66 },
      { t: NOW - 3 * DAY, value: 70 },
    ];
    const r = computeBmrStats(persisted, 70, NOW);
    expect(r.weeklyDelta).toBe(70 - 64);
    expect(r.streak).toBe(2);
    expect(r.latest).toBe(70);
  });
});