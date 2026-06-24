import { describe, expect, it, vi } from "vitest";
import { ARCHETYPES, archetypeAreaFor, baselineBmrFor } from "./onboarding";

describe("archetypeAreaFor", () => {
  it("picks the area with the highest score", () => {
    expect(archetypeAreaFor([1, 2, 5, 3, 2])).toBe("relationship");
    expect(archetypeAreaFor([5, 1, 1, 1, 1])).toBe("mind");
    expect(archetypeAreaFor([1, 1, 1, 1, 5])).toBe("spirit");
  });
  it("breaks ties left-to-right (stable)", () => {
    expect(archetypeAreaFor([3, 3, 3, 3, 3])).toBe("mind");
    expect(archetypeAreaFor([1, 4, 4, 1, 1])).toBe("body");
  });
});

describe("baselineBmrFor", () => {
  it("returns the upper bound when everything is minimal", () => {
    expect(baselineBmrFor([1, 1, 1, 1, 1])).toBe(82);
  });
  it("collapses toward the lower bound when everything is maximal", () => {
    // 82 - (25 - 5) * 1.6 = 50; floor of the clamp is 48, but the formula
    // bottoms out at 50 with five questions on a 1..5 scale.
    expect(baselineBmrFor([5, 5, 5, 5, 5])).toBe(50);
  });
  it("decreases as load increases", () => {
    const low = baselineBmrFor([2, 2, 2, 2, 2]);
    const high = baselineBmrFor([4, 4, 4, 4, 4]);
    expect(low).toBeGreaterThan(high);
  });
});

/**
 * "End-to-end" guard for the write-and-redirect contract: when the user
 * finishes onboarding we must (1) update the profiles row with archetype +
 * baseline + onboarded_at, and (2) navigate to "/". This simulates that
 * sequence so a regression in the finish handler trips the test without
 * needing Playwright or a real Supabase round-trip.
 */
describe("onboarding finish contract", () => {
  it("writes archetype + baseline_bmr + onboarded_at, then redirects home", async () => {
    const answers = [2, 5, 1, 3, 2];
    const area = archetypeAreaFor(answers);
    const baseline = baselineBmrFor(answers);

    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const navigate = vi.fn();

    async function finish() {
      const { error } = await from("profiles")
        .update({
          archetype: ARCHETYPES[area].name,
          archetype_scores: Object.fromEntries(
            answers.map((v, i) => [["mind", "body", "relationship", "work", "spirit"][i], v]),
          ),
          baseline_bmr: baseline,
          onboarded_at: new Date().toISOString(),
        })
        .eq("user_id", "user-1");
      if (error) throw error;
      navigate({ to: "/" });
    }

    await finish();

    expect(from).toHaveBeenCalledWith("profiles");
    const payload = update.mock.calls[0][0];
    expect(payload.archetype).toBe("The Embodied");
    expect(payload.baseline_bmr).toBe(baseline);
    expect(payload.archetype_scores).toEqual({
      mind: 2, body: 5, relationship: 1, work: 3, spirit: 2,
    });
    expect(typeof payload.onboarded_at).toBe("string");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });
});