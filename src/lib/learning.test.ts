// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLearning,
  recordPrefChange,
  recordReminder,
  summarize,
} from "./learning";

beforeEach(() => {
  window.localStorage.clear();
  clearLearning();
});

describe("learning.summarize", () => {
  it("returns a neutral summary when nothing has been recorded", () => {
    const s = summarize();
    expect(s.totalPrefChanges).toBe(0);
    expect(s.mostTunedPref).toBeNull();
    expect(s.preferredReminderSlot).toBe("none");
    expect(s.consistency).toBe(0);
  });

  it("counts pref changes and finds the most-tuned key", () => {
    recordPrefChange("theme", "dusk");
    recordPrefChange("theme", "rose");
    recordPrefChange("aiModel", "gpt");
    const s = summarize();
    expect(s.totalPrefChanges).toBe(3);
    expect(s.mostTunedPref).toBe("theme");
  });

  it("classifies the preferred reminder slot from fired events", () => {
    recordReminder("morning", "fired");
    recordReminder("morning", "fired");
    recordReminder("morning", "fired");
    recordReminder("evening", "fired");
    const s = summarize();
    expect(s.preferredReminderSlot).toBe("morning");
  });

  it("returns balanced when slots are similar", () => {
    recordReminder("morning", "fired");
    recordReminder("evening", "fired");
    expect(summarize().preferredReminderSlot).toBe("balanced");
  });

  it("computes consistency as fired / (fired + skipped)", () => {
    recordReminder("morning", "fired");
    recordReminder("morning", "fired");
    recordReminder("evening", "skipped");
    recordReminder("evening", "skipped");
    expect(summarize().consistency).toBe(0.5);
  });
});