// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  CODE_TTL_MS,
  JOIN_LIMIT,
  createCircle,
  isValidCodeShape,
  joinAttemptsRemaining,
  joinByCode,
  leaveCircle,
  listCircles,
  resetJoinThrottle,
  rotateJoinCode,
} from "./circles";

beforeEach(() => {
  window.localStorage.clear();
  resetJoinThrottle();
});

describe("circles persistence", () => {
  it("seeds with the preview circles on first read", () => {
    const seeded = listCircles();
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.every((c) => c.source === "preview")).toBe(true);
  });

  it("persists a created circle across reads", () => {
    const c = createCircle("My Room", "private");
    expect(c.joinCode).toBeTruthy();
    expect(listCircles()[0]).toMatchObject({ id: c.id, name: "My Room" });
    // simulate reload
    const raw = window.localStorage.getItem("metabyx:circles:v1");
    expect(raw).toContain("My Room");
  });

  it("joining a code idempotently returns the existing circle", () => {
    const a = createCircle("Shared", "private");
    const b = joinByCode(a.joinCode!);
    expect(b.id).toBe(a.id);
    expect(listCircles().filter((c) => c.joinCode === a.joinCode)).toHaveLength(1);
  });

  it("joining an unknown code creates a placeholder room", () => {
    const joined = joinByCode("WXYZ-1234");
    expect(joined.source).toBe("joined");
    expect(listCircles().some((c) => c.id === joined.id)).toBe(true);
  });

  it("rejects codes that don't match ABCD-1234 shape with a generic error", () => {
    expect(() => joinByCode("AB")).toThrow(/invalid or has expired/i);
    expect(() => joinByCode("ABCDEFGH")).toThrow(/invalid or has expired/i);
    expect(isValidCodeShape("ABCD-1234")).toBe(true);
    expect(isValidCodeShape("abcd-1234")).toBe(true); // normalized in joinByCode
    expect(isValidCodeShape("AB-CD")).toBe(false);
  });

  it("leaveCircle removes the circle", () => {
    const c = createCircle("Temporary", "public");
    leaveCircle(c.id);
    expect(listCircles().some((x) => x.id === c.id)).toBe(false);
  });
});

describe("invite-only join hardening", () => {
  it("throttles repeated join attempts and counts even bad shapes", () => {
    expect(joinAttemptsRemaining()).toBe(JOIN_LIMIT);
    for (let i = 0; i < JOIN_LIMIT; i++) {
      // bad-shape attempts must also burn the rate limit so attackers can't
      // probe codes for free by sending garbage.
      expect(() => joinByCode("XX")).toThrow(/invalid or has expired/i);
    }
    expect(joinAttemptsRemaining()).toBe(0);
    expect(() => joinByCode("ABCD-1234")).toThrow(/too many join attempts/i);
  });

  it("treats an expired code as invalid with the same generic error", () => {
    const c = createCircle("Old room", "private");
    const code = c.joinCode!;
    const expiredAt = (c.codeCreatedAt ?? Date.now()) + CODE_TTL_MS + 1;
    expect(() => joinByCode(code, expiredAt)).toThrow(/invalid or has expired/i);
  });

  it("never reveals whether a private code matches a real circle (no enumeration)", () => {
    const real = createCircle("Hidden", "private");
    // Probing with the wrong shape and probing with a well-formed unknown
    // code that ISN'T in the local store must both produce the same opaque
    // error — same string, no info about the real room's existence.
    let badShapeMsg = "";
    try {
      joinByCode("zz-zz");
    } catch (e) {
      badShapeMsg = (e as Error).message;
    }
    resetJoinThrottle();
    // The wrong-but-well-formed code creates a placeholder rather than
    // leaking existence — confirm it doesn't echo the real room's name.
    const placeholder = joinByCode("NOPE-9999");
    expect(placeholder.name).not.toContain(real.name);
    expect(placeholder.source).toBe("joined");
    expect(badShapeMsg).toMatch(/invalid or has expired/i);
  });

  it("rotateJoinCode mints a fresh code and resets the timer", () => {
    const c = createCircle("Rotatable", "private");
    const first = c.joinCode!;
    const rotated = rotateJoinCode(c.id)!;
    expect(rotated.joinCode).not.toBe(first);
    expect(rotated.codeCreatedAt).toBeGreaterThanOrEqual(c.codeCreatedAt ?? 0);
    // Old code no longer resolves.
    expect(() => joinByCode(first)).toThrow(/invalid or has expired/i);
  });

  it("rotateJoinCode only works for circles you created (not joined / seeds)", () => {
    const seed = listCircles().find((c) => c.source === "preview")!;
    expect(rotateJoinCode(seed.id)).toBeNull();
  });
});