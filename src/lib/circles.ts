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
  joinedAt: number;
  source: "preview" | "created" | "joined";
};

const KEY = "metabyx:circles:v1";
const EVENT = "metabyx:circles:change";

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
  const circle: Circle = {
    id,
    name: name.trim() || "Untitled circle",
    members: 1,
    pulse: 70,
    visibility,
    hint: "Your room. Invite a few people in with the code below.",
    joinCode: randomCode(),
    joinedAt: Date.now(),
    source: "created",
  };
  write([circle, ...read()]);
  return circle;
}

export function joinByCode(code: string): Circle {
  const cleaned = code.trim().toUpperCase();
  if (cleaned.length < 4) throw new Error("That code looks too short.");
  const existing = read().find((c) => c.joinCode === cleaned);
  if (existing) return existing;
  const circle: Circle = {
    id:
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}`) as string,
    name: `Circle ${cleaned}`,
    members: 2,
    pulse: 70,
    visibility: "private",
    hint: "Joined by code — waiting on the others to check in.",
    joinCode: cleaned,
    joinedAt: Date.now(),
    source: "joined",
  };
  write([circle, ...read()]);
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