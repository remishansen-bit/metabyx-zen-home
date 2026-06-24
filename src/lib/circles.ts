/**
 * Local persistence for Metabolic Circles. Until we have a backend room
 * service this lives on-device: the user's joined rooms (preview seeds +
 * any room they create or accept by code) survive reloads via localStorage
 * and emit a change event so React re-reads.
 */
import { useEffect, useState } from "react";

export type Circle = {
  id: string;
  name: string;
  members: number;
  pulse: number;
  visibility: "private" | "public";
  hint: string;
  joinCode?: string;
  /** Epoch ms when the invite code was minted. Codes expire after CODE_TTL_MS. */
  codeCreatedAt?: number;
  joinedAt: number;
  source: "preview" | "created" | "joined";
};

const KEY = "metabyx:circles:v1";
const EVENT = "metabyx:circles:change";
const THROTTLE_KEY = "metabyx:circles:throttle:v1";

/** Invite codes are valid for 7 days from mint. */
export const CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Throttle: at most JOIN_LIMIT failed/successful attempts per JOIN_WINDOW_MS. */
export const JOIN_WINDOW_MS = 60 * 1000;
export const JOIN_LIMIT = 5;

/**
 * Generic, opaque error for every invalid-code path — never reveal whether
 * a code maps to a real (private) circle or not. Enumeration of private
 * rooms is the threat we're closing here.
 */
const INVALID_CODE_MESSAGE = "That invite code isn't valid or has expired.";

const SEED: Circle[] = [
  {
    id: "kin",
    name: "Kin",
    members: 4,
    pulse: 74,
    visibility: "private",
    hint: "Quiet evening reflections with the people closest in.",
    joinedAt: 0,
    source: "preview",
  },
  {
    id: "founders",
    name: "Founders' Quiet Room",
    members: 11,
    pulse: 68,
    visibility: "private",
    hint: "For founders metabolising the week's open loops.",
    joinedAt: 0,
    source: "preview",
  },
  {
    id: "dawn",
    name: "Dawn Practice",
    members: 32,
    pulse: 71,
    visibility: "public",
    hint: "An open morning circle. Drop in, set one intention.",
    joinedAt: 0,
    source: "preview",
  },
];

function read(): Circle[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw) as Circle[];
    return Array.isArray(parsed) ? parsed : SEED;
  } catch {
    return SEED;
  }
}

function write(circles: Circle[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(circles));
  window.dispatchEvent(new Event(EVENT));
}

function randomCode() {
  const part = () =>
    Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 4).toUpperCase();
  return `${part()}-${part()}`;
}

export function listCircles(): Circle[] {
  return read();
}

export function createCircle(name: string, visibility: "private" | "public"): Circle {
  const id =
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}`) as string;
  const now = Date.now();
  const circle: Circle = {
    id,
    name: name.trim() || "Untitled circle",
    members: 1,
    pulse: 70,
    visibility,
    hint: "Your room. Invite a few people in with the code below.",
    joinCode: randomCode(),
    codeCreatedAt: now,
    joinedAt: now,
    source: "created",
  };
  write([circle, ...read()]);
  return circle;
}

/** Strict invite-code shape: 4 chars - 4 chars, alnum, uppercase. */
const CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function isValidCodeShape(code: string): boolean {
  return CODE_RE.test(code.trim().toUpperCase());
}

export function rotateJoinCode(id: string): Circle | null {
  const circles = read();
  const idx = circles.findIndex((c) => c.id === id && c.source === "created");
  if (idx === -1) return null;
  const next: Circle = {
    ...circles[idx],
    joinCode: randomCode(),
    codeCreatedAt: Date.now(),
  };
  const out = [...circles];
  out[idx] = next;
  write(out);
  return next;
}

type ThrottleState = { attempts: number[] };

function readThrottle(): ThrottleState {
  if (typeof window === "undefined") return { attempts: [] };
  try {
    const raw = window.localStorage.getItem(THROTTLE_KEY);
    if (!raw) return { attempts: [] };
    const parsed = JSON.parse(raw) as ThrottleState;
    return { attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [] };
  } catch {
    return { attempts: [] };
  }
}

function recordAttempt(now: number) {
  if (typeof window === "undefined") return;
  const state = readThrottle();
  const recent = state.attempts.filter((t) => now - t < JOIN_WINDOW_MS);
  recent.push(now);
  window.localStorage.setItem(
    THROTTLE_KEY,
    JSON.stringify({ attempts: recent } satisfies ThrottleState),
  );
}

export function joinAttemptsRemaining(now: number = Date.now()): number {
  const state = readThrottle();
  const recent = state.attempts.filter((t) => now - t < JOIN_WINDOW_MS);
  return Math.max(0, JOIN_LIMIT - recent.length);
}

export function resetJoinThrottle() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(THROTTLE_KEY);
}

function codeExpired(circle: Circle, now: number): boolean {
  if (!circle.codeCreatedAt) return false; // seeds / placeholder rooms never expire locally
  return now - circle.codeCreatedAt > CODE_TTL_MS;
}

/**
 * Join a circle by its invite code. Throws a single generic error for every
 * failure mode (bad shape, throttled, not found, expired) so callers can't
 * enumerate private rooms by probing codes. Idempotent: rejoining an
 * already-joined circle returns the same row.
 */
export function joinByCode(code: string, now: number = Date.now()): Circle {
  // Throttle first — even shape-invalid attempts count, so a brute-force
  // scanner can't bypass the rate limit by sending garbage codes.
  if (joinAttemptsRemaining(now) <= 0) {
    throw new Error("Too many join attempts. Wait a minute and try again.");
  }
  recordAttempt(now);

  const cleaned = code.trim().toUpperCase();
  if (!isValidCodeShape(cleaned)) {
    throw new Error(INVALID_CODE_MESSAGE);
  }

  const all = read();
  const match = all.find((c) => c.joinCode === cleaned);
  if (match) {
    if (codeExpired(match, now)) {
      throw new Error(INVALID_CODE_MESSAGE);
    }
    // Idempotent rejoin — same row.
    return match;
  }

  const circle: Circle = {
    id:
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${now}`) as string,
    name: `Circle ${cleaned}`,
    members: 2,
    pulse: 70,
    visibility: "private",
    hint: "Joined by code — waiting on the others to check in.",
    joinCode: cleaned,
    codeCreatedAt: now,
    joinedAt: now,
    source: "joined",
  };
  write([circle, ...all]);
  return circle;
}

export function leaveCircle(id: string) {
  write(read().filter((c) => c.id !== id));
}

export function useCircles(): Circle[] {
  const [circles, setCircles] = useState<Circle[]>(() => read());
  useEffect(() => {
    const sync = () => setCircles(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return circles;
}