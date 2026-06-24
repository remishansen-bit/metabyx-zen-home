/**
 * Pure helpers for the first-run onboarding flow. Kept out of the route so
 * the archetype-selection and baseline-BMR maths can be unit-tested without
 * spinning up React or mocking Supabase.
 *
 * The flow asks 5 questions on a 1..5 scale, one per life area. The area
 * with the highest score becomes the user's archetype; the cumulative load
 * collapses into a single baseline BMR in the 48..82 range.
 */

export type Area = "mind" | "body" | "relationship" | "work" | "spirit";

export const ONBOARDING_QUESTIONS: { area: Area; prompt: string }[] = [
  { area: "mind", prompt: "How often do 'what if' loops circle in your mind?" },
  { area: "body", prompt: "How often does tension settle into your body?" },
  { area: "relationship", prompt: "How often do unspoken things linger between you and others?" },
  { area: "work", prompt: "How often do open loops at work pull at your attention?" },
  { area: "spirit", prompt: "How often do you feel cut off from a deeper sense of meaning?" },
];

export const ARCHETYPES: Record<Area, { name: string; tagline: string }> = {
  mind: { name: "The Reflector", tagline: "You metabolise through naming the loops." },
  body: { name: "The Embodied", tagline: "Your body is where the truth lands first." },
  relationship: { name: "The Connector", tagline: "You integrate by being seen." },
  work: { name: "The Builder", tagline: "You move when the open loops are closed." },
  spirit: { name: "The Seeker", tagline: "You return to centre through meaning." },
};

/** First area whose answer is highest (stable left-to-right). */
export function archetypeAreaFor(answers: number[]): Area {
  let topI = 0;
  for (let i = 1; i < answers.length; i++) if (answers[i] > answers[topI]) topI = i;
  return ONBOARDING_QUESTIONS[topI].area;
}

/** Baseline BMR clamped to 48..82 — higher total load lowers the baseline. */
export function baselineBmrFor(answers: number[]): number {
  const total = answers.reduce((a, b) => a + b, 0);
  return Math.max(48, Math.min(82, Math.round(82 - (total - answers.length) * 1.6)));
}