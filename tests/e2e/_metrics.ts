import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@playwright/test";

/**
 * Records skeleton appear/persist durations to a JSON file picked up by CI
 * (uploaded with the rest of the Playwright artifacts) and fails the test
 * when the measurement falls outside the configured bound.
 */

const DIR = "test-results/metrics";
const FILE = join(DIR, "skeleton-timings.json");

export type SkeletonBounds = { minMs: number; maxMs: number };

export interface SkeletonMetric {
  spec: string;
  screen: string;
  phase: "appear" | "persist";
  ms: number;
  bounds: SkeletonBounds;
  pass: boolean;
  recordedAt: string;
}

export function recordSkeletonMetric(m: Omit<SkeletonMetric, "pass" | "recordedAt">) {
  mkdirSync(DIR, { recursive: true });
  const pass = m.ms >= m.bounds.minMs && m.ms <= m.bounds.maxMs;
  const entry: SkeletonMetric = { ...m, pass, recordedAt: new Date().toISOString() };
  const existing: SkeletonMetric[] = existsSync(FILE)
    ? JSON.parse(readFileSync(FILE, "utf8"))
    : [];
  existing.push(entry);
  writeFileSync(FILE, JSON.stringify(existing, null, 2), "utf8");
  return entry;
}

/** Assert + record in one call so CI gets the data even on failure. */
export function assertSkeletonWithin(
  spec: string,
  screen: string,
  phase: SkeletonMetric["phase"],
  ms: number,
  bounds: SkeletonBounds,
) {
  const entry = recordSkeletonMetric({ spec, screen, phase, ms, bounds });
  expect(
    entry.pass,
    `[${spec}] ${screen} skeleton ${phase} ${ms}ms outside [${bounds.minMs}-${bounds.maxMs}]ms`,
  ).toBe(true);
}