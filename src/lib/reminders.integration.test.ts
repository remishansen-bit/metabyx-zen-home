/**
 * Integration-level coverage for the reminder scheduler. We stub the
 * Notification global, freeze time with vi.useFakeTimers(), and assert that
 * the scheduler:
 *   1. respects the per-slot toggles
 *   2. fires at the configured time
 *   3. records the fire in the local learning log
 *   4. degrades to an in-app toast when permission is revoked
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleReminders } from "./reminders";
import { readLearning, clearLearning } from "./learning";

let permission: NotificationPermission = "granted";
const ctor = vi.fn();

class FakeNotification {
  static get permission() {
    return permission;
  }
  static requestPermission = vi.fn(async () => permission);
  constructor(title: string, opts?: NotificationOptions) {
    ctor(title, opts);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-24T07:59:00"));
  permission = "granted";
  ctor.mockClear();
  window.localStorage.clear();
  clearLearning();
  (globalThis as unknown as { Notification: typeof FakeNotification }).Notification =
    FakeNotification;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduleReminders", () => {
  it("does nothing when notifications are off", () => {
    scheduleReminders({
      notifications: false,
      morningReminder: true,
      eveningReminder: true,
      morningTime: "08:00",
      eveningTime: "21:00",
    });
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("fires only the slots toggled on, at the right time", () => {
    scheduleReminders({
      notifications: true,
      morningReminder: true,
      eveningReminder: false,
      morningTime: "08:00",
      eveningTime: "21:00",
    });
    // 59s before 08:00 → nothing yet
    vi.advanceTimersByTime(30 * 1000);
    expect(ctor).not.toHaveBeenCalled();
    // cross 08:00
    vi.advanceTimersByTime(60 * 1000);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor.mock.calls[0][0]).toBe("Morning check-in");
    // evening slot was off, so no evening fire even after hours
    vi.advanceTimersByTime(14 * 60 * 60 * 1000);
    const eveningCalls = ctor.mock.calls.filter((c) => c[0] === "Evening integration");
    expect(eveningCalls).toHaveLength(0);
  });

  it("records fired reminders in the on-device learning log", () => {
    scheduleReminders({
      notifications: true,
      morningReminder: true,
      eveningReminder: false,
      morningTime: "08:00",
      eveningTime: "21:00",
    });
    vi.advanceTimersByTime(90 * 1000);
    const log = readLearning().reminderHistory;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ slot: "morning", action: "fired" });
  });

  it("falls back to an in-app toast when permission flips to denied", () => {
    scheduleReminders({
      notifications: true,
      morningReminder: true,
      eveningReminder: false,
      morningTime: "08:00",
      eveningTime: "21:00",
    });
    // Simulate the OS / user revoking notification permission before fire.
    permission = "denied";
    vi.advanceTimersByTime(90 * 1000);
    // The Notification constructor must NOT be called when permission is not granted.
    expect(ctor).not.toHaveBeenCalled();
    // But the reminder still fires (via toast) and lands in the learning log.
    expect(readLearning().reminderHistory).toHaveLength(1);
  });

  it("reschedules cleanly when the user changes the reminder time", () => {
    scheduleReminders({
      notifications: true,
      morningReminder: true,
      eveningReminder: false,
      morningTime: "08:00",
      eveningTime: "21:00",
    });
    // Replace schedule before original fires — new time at 09:00
    scheduleReminders({
      notifications: true,
      morningReminder: true,
      eveningReminder: false,
      morningTime: "09:00",
      eveningTime: "21:00",
    });
    // Cross the old 08:00 boundary — old timer must be cleared.
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(ctor).not.toHaveBeenCalled();
    // Cross the new 09:00 boundary.
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(ctor).toHaveBeenCalledTimes(1);
  });
});