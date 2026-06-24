import { describe, expect, it } from "vitest";
import { formatRelative, nextFireAt } from "./reminders";

describe("nextFireAt", () => {
  it("schedules later today when the time hasn't passed", () => {
    const now = new Date("2026-06-24T07:00:00");
    const ms = nextFireAt("08:00", now);
    expect(ms).toBe(60 * 60 * 1000);
  });

  it("rolls to tomorrow when the time already passed", () => {
    const now = new Date("2026-06-24T22:30:00");
    const ms = nextFireAt("08:00", now);
    expect(ms).toBe((9 * 60 + 30) * 60 * 1000);
  });

  it("treats an exact match as already-passed (next day)", () => {
    const now = new Date("2026-06-24T08:00:00");
    const ms = nextFireAt("08:00", now);
    expect(ms).toBe(24 * 60 * 60 * 1000);
  });

  it("defaults missing hours/minutes to zero", () => {
    const now = new Date("2026-06-24T00:30:00");
    const ms = nextFireAt("invalid", now);
    // bad input → 00:00 today, already passed → tomorrow 00:00
    expect(ms).toBe((24 * 60 - 30) * 60 * 1000);
  });
});

describe("formatRelative", () => {
  it("formats sub-minute as seconds", () => {
    expect(formatRelative(45_000)).toBe("in 45s");
  });
  it("formats sub-hour as minutes", () => {
    expect(formatRelative(15 * 60_000)).toBe("in 15m");
  });
  it("formats hours + minutes", () => {
    expect(formatRelative((2 * 60 + 14) * 60_000)).toBe("in 2h 14m");
  });
  it("formats clean hours without trailing 0m", () => {
    expect(formatRelative(3 * 60 * 60_000)).toBe("in 3h");
  });
  it("clamps non-positive to 'now'", () => {
    expect(formatRelative(0)).toBe("now");
    expect(formatRelative(-500)).toBe("now");
  });
});